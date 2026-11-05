import type { Channel } from "@/generated/prisma/client";
import { getClient } from "@/lib/channels";
import { db } from "@/lib/db";
import { findBySender, findOrCreateBySender } from "@/lib/engine/contacts";
import { handleIceBreaker } from "@/lib/engine/icebreakers";
import { payloads } from "@/lib/engine/payloads";
import { advanceSession } from "@/lib/engine/session";
import { findWaitingRun, resumeFlow } from "@/lib/flows/engine";
import { handleStoryReply } from "@/lib/engine/story";
import type { MessagingEvent } from "@/lib/engine/types";
import { normalize } from "@/lib/matching";

/** The whole message must be one of these, so "don't stop" or "stop by later" don't opt anyone out. */
const STOP_WORDS = new Set(["stop", "unsubscribe", "बंद", "band karo"]);
const START_WORDS = new Set(["start", "subscribe"]);
const OPEN_SESSION_DAYS = 7;

export async function handleMessage(channel: Channel, event: MessagingEvent, accountId: string) {
  const senderId = event.sender.id;
  if (event.message?.is_echo || event.message?.is_deleted) return "echo";
  // Reads, reactions and other events without a message or a button tap.
  if (!event.message && !event.postback) return "ignored";
  if (senderId === accountId) return "own_message";

  const client = await getClient(channel);
  if (senderId === client.externalId) return "own_message";

  const payload = event.message?.quick_reply?.payload ?? event.postback?.payload;
  const text = event.message?.text ?? event.postback?.title ?? "";
  const command = payload ? null : normalize(text);

  if (command && STOP_WORDS.has(command)) {
    const contact = await findOrCreateBySender(channel, senderId);
    await db.contact.update({ where: { id: contact.id }, data: { optedOut: true } });
    await client.sendMessage(
      senderId,
      "Done. You won't get automatic messages from us any more. Send START to turn them back on.",
    );
    return "opted_out";
  }
  if (command && START_WORDS.has(command)) {
    const contact = await findBySender(channel, senderId);
    if (contact?.optedOut) {
      await db.contact.update({ where: { id: contact.id }, data: { optedOut: false } });
      await client.sendMessage(senderId, "You're back on. Welcome!");
      return "opted_in";
    }
  }

  // A tap on a flow button carries the run, node and branch.
  const flowTap = payloads.parseFlow(payload);
  if (flowTap) {
    return resumeFlow(flowTap.runId, { senderId, text, payload: { nodeId: flowTap.nodeId, handle: flowTap.handle } });
  }

  // A tap on one of our other buttons carries the session or ice breaker ID.
  const parsed = payloads.parse(payload);
  if (parsed?.action === "ICE") {
    return handleIceBreaker(client, await findOrCreateBySender(channel, senderId), senderId, parsed.id);
  }
  if (parsed) return advanceSession(parsed.id, senderId, parsed.action);

  // Instagram story reply: runs a story automation if one matches.
  const storyId = event.message?.reply_to?.story?.id;
  if (storyId && channel === "INSTAGRAM") {
    const contact = await findOrCreateBySender(channel, senderId);
    const result = await handleStoryReply(client, contact, senderId, storyId, text);
    if (result !== "no_trigger") return result;
  }

  // Typed text continues the person's latest waiting flow or open link session, whichever is newer.
  const contact = await findBySender(channel, senderId);
  if (!contact) return "no_session";
  const since = new Date(Date.now() - OPEN_SESSION_DAYS * 24 * 3600 * 1000);
  const [run, open] = await Promise.all([
    findWaitingRun(contact.id),
    db.linkSession.findFirst({
      where: {
        contactId: contact.id,
        status: { in: ["AWAITING_TAP", "AWAITING_FOLLOW"] },
        createdAt: { gte: since },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  if (run && (!open || run.updatedAt >= open.updatedAt)) return resumeFlow(run.id, { senderId, text });
  if (open) return advanceSession(open.id, senderId, "TEXT");
  return "no_session";
}
