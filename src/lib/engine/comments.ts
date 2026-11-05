import type { Channel } from "@/generated/prisma/client";
import { getClient } from "@/lib/channels";
import { db } from "@/lib/db";
import { rememberDmId } from "@/lib/engine/contacts";
import { payloads } from "@/lib/engine/payloads";
import { startFlow } from "@/lib/flows/engine";
import { chooseTrigger } from "@/lib/engine/triggers";
import type { InboundComment } from "@/lib/engine/types";
import { errorText } from "@/lib/graph";
import { inHandoff, notifyAbout } from "@/lib/inbox";

async function findTrigger(channel: Channel, mediaId: string, text: string) {
  const triggers = await db.trigger.findMany({
    where: {
      active: true,
      channel,
      kind: "COMMENT",
      OR: [{ scope: "POSTS", mediaIds: { has: mediaId } }, { scope: "ALL_POSTS" }, { scope: "DEFAULT" }],
    },
  });
  return chooseTrigger(triggers, text);
}

function pick<T>(items: T[]): T | undefined {
  return items.length ? items[Math.floor(Math.random() * items.length)] : undefined;
}

/** Instagram gets an @mention; Facebook mentions need the tagging API, so use the plain name. */
function mention(channel: Channel, name: string | undefined) {
  if (!name) return "";
  return channel === "INSTAGRAM" ? `@${name}` : name;
}

export async function handleComment(channel: Channel, c: InboundComment, accountId: string) {
  const client = await getClient(channel);
  // Ignore our own replies (they arrive as comment webhooks too).
  if (c.fromId === accountId || c.fromId === client.externalId) return "own_comment";
  if (channel === "INSTAGRAM" && c.fromName && c.fromName === client.username) return "own_comment";

  const contact = await db.contact.upsert({
    where: { channel_externalId: { channel, externalId: c.fromId } },
    create: { channel, externalId: c.fromId, username: c.fromName },
    update: c.fromName ? { username: c.fromName } : {},
  });

  const existing = await db.comment.findUnique({ where: { channel_commentId: { channel, commentId: c.id } } });
  if (existing) return "duplicate";

  const trigger = await findTrigger(channel, c.mediaId, c.text);
  const comment = await db.comment.create({
    data: {
      channel,
      commentId: c.id,
      mediaId: c.mediaId,
      text: c.text,
      fromId: c.fromId,
      fromUsername: c.fromName,
      contactId: contact.id,
      triggerId: trigger?.id,
      matched: Boolean(trigger),
    },
  });

  if (!trigger) return "no_trigger";

  /** Posts one of the public replies and records it (or the error) on the comment. */
  async function publicReply(variants: string[], rowId: string) {
    const variant = pick(variants);
    if (!variant) return;
    try {
      const id = await client.replyToComment(c.id, variant.replaceAll("{username}", mention(channel, c.fromName)).trim());
      await db.comment.update({ where: { id: rowId }, data: { publicReplyId: id } });
    } catch (error) {
      const row = await db.comment.findUniqueOrThrow({ where: { id: rowId } });
      const message = [row.error, `public reply: ${errorText(error)}`].filter(Boolean).join(" | ");
      await db.comment.update({ where: { id: rowId }, data: { error: message } });
    }
  }

  const skip = async (skipReason: string) => {
    await db.comment.update({ where: { id: comment.id }, data: { skipReason } });
    return skipReason;
  };

  if (contact.optedOut) return skip("opted_out");
  // You're talking to them yourself: don't DM over you, but let you know.
  if (inHandoff(contact)) {
    await notifyAbout(contact, "New comment while you're chatting", c.text);
    return skip("handoff");
  }

  if (trigger.oncePerPerson) {
    const already = await db.comment.findFirst({
      where: {
        id: { not: comment.id },
        channel,
        triggerId: trigger.id,
        mediaId: c.mediaId,
        fromId: c.fromId,
        dmSentAt: { not: null },
      },
    });
    if (already) return skip("already_sent");
  }

  // Flow automations: the flow decides what to send, starting with the private reply.
  if (trigger.flowId) {
    const result = await startFlow({
      flowId: trigger.flowId,
      client,
      contact,
      triggerId: trigger.id,
      comment: { rowId: comment.id, platformId: c.id },
      openingText: trigger.dmText,
    });
    await publicReply(trigger.publicReplies, comment.id);
    return result;
  }

  const session = await db.linkSession.create({
    data: { channel, contactId: contact.id, triggerId: trigger.id, commentId: comment.id },
  });

  // 1. Private DM with a quick reply. The tap is a message, which opens the 24 h window
  //    and should give consent for the follow check.
  const button = [{ title: trigger.dmButtonText, payload: payloads.tap(session.id) }];
  let dmError: string | undefined;
  let recipientId: string | undefined;
  try {
    ({ recipientId } = await client.privateReply(c.id, trigger.dmText, button));
  } catch (error) {
    dmError = errorText(error);
    // Fallback: plain text that asks for a typed reply, which is also a message.
    try {
      ({ recipientId } = await client.privateReply(c.id, `${trigger.dmText}\n\nReply "link" here to get it.`));
      dmError = `quick reply failed, sent text: ${dmError}`;
    } catch (fallbackError) {
      await db.comment.update({
        where: { id: comment.id },
        data: { error: `${dmError} | fallback: ${errorText(fallbackError)}` },
      });
      return "dm_failed";
    }
  }
  // The DM-side ID can differ from the commenter ID (always on Facebook). Learn it now.
  await rememberDmId(contact, recipientId);

  await db.comment.update({ where: { id: comment.id }, data: { dmSentAt: new Date(), error: dmError } });

  // 2. Public reply, so the person knows to check their DMs (and message requests).
  await publicReply(trigger.publicReplies, comment.id);
  return "dm_sent";
}
