import type { Channel } from "@/generated/prisma/client";
import { getClient } from "@/lib/channels";
import { db } from "@/lib/db";
import { findBySender, findOrCreateBySender } from "@/lib/engine/contacts";
import { handleIceBreaker } from "@/lib/engine/icebreakers";
import { payloads } from "@/lib/engine/payloads";
import { advanceSession } from "@/lib/engine/session";
import { handleDmKeyword, handleIntent, handleStoryReply } from "@/lib/engine/story";
import { classifyIntent } from "@/lib/ai";
import { orderLabel, stageLabels } from "@/lib/orders";
import { normalizePhone } from "@/lib/whatsapp";
import type { MessagingEvent } from "@/lib/engine/types";
import { findWaitingRun, resumeFlow } from "@/lib/flows/engine";
import { displayName, inHandoff, notifyAbout, recordMessage, startHandoff } from "@/lib/inbox";
import { matchesKeywords, normalize } from "@/lib/matching";

/** The whole message must be one of these, so "don't stop" or "stop by later" don't opt anyone out. */
const STOP_WORDS = new Set(["stop", "unsubscribe", "बंद", "band karo", "stop promotions"]);
const START_WORDS = new Set(["start", "subscribe"]);
/** Anywhere in the message (whole words / phrases). */
const HANDOFF_WORDS = [
  "human",
  "agent",
  "real person",
  "talk to someone",
  "call me",
  "baat karni hai",
  "baat karna hai",
  "insaan",
  "बात करनी है",
];
const OPEN_SESSION_DAYS = 7;
/** Our own API sends are logged right after the call returns; give that a head start over the echo. */
const ECHO_DELAY_MS = 3000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function describe(event: MessagingEvent) {
  const text = event.message?.text ?? event.postback?.title ?? "";
  if (text) return text;
  if (event.message?.reply_to?.story) return "[replied to your story]";
  const types = event.message?.attachments?.map((a) => a.type) ?? [];
  return types.length ? `[${types.join(", ")}]` : "[message]";
}

/**
 * An echo is a message sent from our account. Ours from the API are already logged (same mid).
 * Anything else was typed by you in the Instagram / Messenger app: log it and pause the bot.
 */
async function handleEcho(channel: Channel, event: MessagingEvent) {
  const mid = event.message?.mid;
  if (!mid) return "echo";
  await sleep(ECHO_DELAY_MS);
  const known = await db.message.findUnique({ where: { channel_mid: { channel, mid } } });
  if (known) return "echo";
  const contact = await findBySender(channel, event.recipient.id);
  if (!contact) return "echo";
  const row = await recordMessage({
    channel,
    contactId: contact.id,
    direction: "OUT",
    source: "APP",
    text: describe(event),
    mid,
  });
  if (!row) return "echo";
  await startHandoff(contact.id);
  await db.contact.update({ where: { id: contact.id }, data: { handoffAskedAt: null } });
  return "manual_reply";
}

export async function handleMessage(channel: Channel, event: MessagingEvent, accountId: string) {
  const senderId = event.sender.id;
  if (event.message?.is_deleted) return "ignored";
  if (event.message?.is_echo) return handleEcho(channel, event);
  // Reads, reactions and other events without a message or a button tap.
  if (!event.message && !event.postback) return "ignored";
  if (senderId === accountId) return "own_message";

  const client = await getClient(channel);
  if (senderId === client.externalId) return "own_message";

  const payload = event.message?.quick_reply?.payload ?? event.postback?.payload;
  const text = event.message?.text ?? event.postback?.title ?? "";
  const command = payload ? null : normalize(text);
  const attachments = (event.message?.attachments ?? [])
    .map((a) => a.payload?.url)
    .filter((u): u is string => Boolean(u));

  // Every DM goes in the inbox, whatever the bot does with it.
  let contact = await findOrCreateBySender(channel, senderId);
  // WhatsApp gives us the profile name and the phone number (the sender ID is the number).
  if (channel === "WHATSAPP") {
    const name = event.sender.name?.trim() || contact.name;
    const phone = normalizePhone(senderId) ?? contact.phone;
    if (name !== contact.name || phone !== contact.phone) {
      contact = await db.contact.update({ where: { id: contact.id }, data: { name, phone } });
    }
  }
  const logged = await recordMessage({
    channel,
    contactId: contact.id,
    direction: "IN",
    source: "CONTACT",
    text: describe(event),
    mid: event.message?.mid ?? event.postback?.mid,
  });
  if (!logged && (event.message?.mid || event.postback?.mid)) return "duplicate";
  const who = displayName(contact);

  if (command && STOP_WORDS.has(command)) {
    await db.contact.update({ where: { id: contact.id }, data: { optedOut: true, marketingOptInAt: null } });
    await client.sendMessage(
      senderId,
      "Done. You won't get automatic messages from us any more. Send START to turn them back on.",
    );
    return "opted_out";
  }
  if (command && START_WORDS.has(command) && contact.optedOut) {
    await db.contact.update({ where: { id: contact.id }, data: { optedOut: false } });
    await client.sendMessage(senderId, "You're back on. Welcome!");
    return "opted_in";
  }

  // You're handling this one: the bot stays out of it.
  if (inHandoff(contact)) {
    await notifyAbout(contact, `${who} replied`, describe(event));
    return "handoff";
  }
  if (command && matchesKeywords(text, HANDOFF_WORDS)) {
    contact = await startHandoff(contact.id, { asked: true });
    await client.sendMessage(senderId, "Sure! Someone from Red Thread will reply here soon. 🙏");
    await notifyAbout(contact, `${who} wants to talk to you`, describe(event), { urgent: true });
    return "handoff_requested";
  }

  // A tap on a flow button carries the run, node and branch.
  const flowTap = payloads.parseFlow(payload);
  if (flowTap) {
    return resumeFlow(flowTap.runId, {
      senderId,
      text,
      attachments,
      payload: { nodeId: flowTap.nodeId, handle: flowTap.handle },
    });
  }

  // A tap on one of our other buttons carries the session or ice breaker ID.
  const parsed = payloads.parse(payload);
  if (parsed?.action === "ICE") return handleIceBreaker(client, contact, senderId, parsed.id);
  if (parsed) return advanceSession(parsed.id, senderId, parsed.action);

  // WhatsApp ice breakers ("prompts") arrive as the prompt's text, with no payload.
  if (channel === "WHATSAPP" && !payload && text) {
    const prompt = await db.iceBreaker.findFirst({ where: { channel, question: text.trim() } });
    if (prompt) return handleIceBreaker(client, contact, senderId, prompt.id);
  }

  // Instagram story reply: runs a story automation if one matches.
  const storyId = event.message?.reply_to?.story?.id;
  if (storyId && channel === "INSTAGRAM") {
    const result = await handleStoryReply(client, contact, senderId, storyId, text);
    if (result !== "no_trigger") return result;
  }

  // Typed text continues the person's latest waiting flow or open link session, whichever is newer.
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
  if (run && (!open || run.updatedAt >= open.updatedAt)) return resumeFlow(run.id, { senderId, text, attachments });
  if (open) return advanceSession(open.id, senderId, "TEXT");

  // DM keyword automations ("price", "designs", "kitn*"...).
  if (text && !payload) {
    const byKeyword = await handleDmKeyword(client, contact, senderId, text);
    if (byKeyword !== "no_trigger") return byKeyword;

    // Nothing matched: let the AI read it (Hinglish included), within the monthly cap.
    const ai = await classifyIntent(text);
    if (ai?.intent === "human") {
      contact = await startHandoff(contact.id, { asked: true });
      await client.sendMessage(senderId, "Sure! Someone from Red Thread will reply here soon. 🙏");
      await notifyAbout(contact, `${who} wants to talk to you`, describe(event), { urgent: true });
      return "ai_handoff";
    }
    if (ai?.intent === "order_status") {
      const order = await db.order.findFirst({ where: { contactId: contact.id }, orderBy: { createdAt: "desc" } });
      if (order) {
        const paid = order.paymentStatus === "PAID" ? "paid" : "not paid yet";
        await client.sendMessage(
          senderId,
          `Your order ${orderLabel(order)} (${order.title}) is ${paid} and at “${stageLabels[order.stage]}”. We'll message you as soon as it moves. 🙏`,
        );
        await notifyAbout(contact, `${who} asked about ${orderLabel(order)}`, describe(event));
        return "ai_order_status";
      }
    }
    if (ai) {
      const byIntent = await handleIntent(client, contact, senderId, ai.intent);
      if (byIntent !== "no_trigger") return `ai_${ai.intent}:${byIntent}`;
    }
  }

  // Nothing automatic applies: this one needs you.
  await notifyAbout(contact, `New message from ${who}`, describe(event));
  return "unhandled";
}
