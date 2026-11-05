import { getAccount } from "@/lib/account";
import { db } from "@/lib/db";
import { instagram, InstagramApiError } from "@/lib/instagram";
import { containsAny, matchesKeywords } from "@/lib/matching";
import { payloads } from "@/lib/engine/session";
import type { IgCommentValue } from "@/lib/engine/types";

const SCOPE_ORDER = { POSTS: 0, ALL_POSTS: 1, DEFAULT: 2 } as const;

/** Post-specific triggers first, then all-posts, then the default; higher priority first within each. */
async function findTrigger(mediaId: string, text: string) {
  const triggers = await db.commentTrigger.findMany({
    where: {
      active: true,
      OR: [{ scope: "POSTS", mediaIds: { has: mediaId } }, { scope: "ALL_POSTS" }, { scope: "DEFAULT" }],
    },
  });
  triggers.sort((a, b) => SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] || b.priority - a.priority);

  const specific = triggers.filter((t) => t.scope !== "DEFAULT");
  for (const t of specific) {
    if (containsAny(text, t.excludeWords)) continue;
    if (matchesKeywords(text, t.keywords)) return t;
  }
  // The default trigger only runs when no other trigger exists for this post at all.
  const postHasOwnTrigger = specific.some((t) => t.scope === "POSTS");
  if (postHasOwnTrigger) return null;
  for (const t of triggers.filter((x) => x.scope === "DEFAULT")) {
    if (containsAny(text, t.excludeWords)) continue;
    if (matchesKeywords(text, t.keywords)) return t;
  }
  return null;
}

function pick<T>(items: T[]): T | undefined {
  return items.length ? items[Math.floor(Math.random() * items.length)] : undefined;
}

function errorText(error: unknown) {
  if (error instanceof InstagramApiError) return `${error.code ?? error.status}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

export async function handleComment(value: IgCommentValue, accountIgUserId: string) {
  const account = await getAccount();
  // Ignore our own replies (they arrive as comment webhooks too).
  if (value.from.id === accountIgUserId || value.from.id === account.igUserId) return "own_comment";
  if (value.from.username && value.from.username === account.username) return "own_comment";

  const text = value.text ?? "";
  const contact = await db.contact.upsert({
    where: { igsid: value.from.id },
    create: { igsid: value.from.id, username: value.from.username },
    update: value.from.username ? { username: value.from.username } : {},
  });

  const existing = await db.comment.findUnique({ where: { commentId: value.id } });
  if (existing) return "duplicate";

  const trigger = await findTrigger(value.media.id, text);
  const comment = await db.comment.create({
    data: {
      commentId: value.id,
      mediaId: value.media.id,
      text,
      fromIgsid: value.from.id,
      fromUsername: value.from.username,
      contactId: contact.id,
      triggerId: trigger?.id,
      matched: Boolean(trigger),
    },
  });

  if (!trigger) return "no_trigger";

  const skip = async (skipReason: string) => {
    await db.comment.update({ where: { id: comment.id }, data: { skipReason } });
    return skipReason;
  };

  if (contact.optedOut) return skip("opted_out");

  if (trigger.oncePerPerson) {
    const already = await db.comment.findFirst({
      where: {
        id: { not: comment.id },
        triggerId: trigger.id,
        mediaId: value.media.id,
        fromIgsid: value.from.id,
        dmSentAt: { not: null },
      },
    });
    if (already) return skip("already_sent");
  }

  const session = await db.linkSession.create({
    data: { contactId: contact.id, triggerId: trigger.id, commentId: comment.id },
  });

  // 1. Private DM with a quick reply. The tap is a message, which opens the 24 h window
  //    and should give consent for the follow check.
  const button = [{ title: trigger.dmButtonText, payload: payloads.tap(session.id) }];
  let dmError: string | undefined;
  try {
    await instagram.privateReply(account.accessToken, account.igUserId, value.id, trigger.dmText, button);
  } catch (error) {
    dmError = errorText(error);
    // Fallback: plain text that asks for a typed reply, which is also a message.
    try {
      await instagram.privateReply(
        account.accessToken,
        account.igUserId,
        value.id,
        `${trigger.dmText}\n\nReply "link" here to get it.`,
      );
      dmError = `quick reply failed, sent text: ${dmError}`;
    } catch (fallbackError) {
      await db.comment.update({
        where: { id: comment.id },
        data: { error: `${dmError} | fallback: ${errorText(fallbackError)}` },
      });
      return "dm_failed";
    }
  }

  // 2. Public reply, so the person knows to check their DMs (and requests folder).
  let publicReplyId: string | undefined;
  const variant = pick(trigger.publicReplies);
  if (variant) {
    try {
      const reply = await instagram.replyToComment(
        account.accessToken,
        value.id,
        variant.replaceAll("{username}", value.from.username ? `@${value.from.username}` : ""),
      );
      publicReplyId = reply.id;
    } catch (error) {
      dmError = [dmError, `public reply: ${errorText(error)}`].filter(Boolean).join(" | ");
    }
  }

  await db.comment.update({
    where: { id: comment.id },
    data: { dmSentAt: new Date(), publicReplyId, error: dmError },
  });
  return "dm_sent";
}
