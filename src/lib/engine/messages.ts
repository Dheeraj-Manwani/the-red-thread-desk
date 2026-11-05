import { getAccount } from "@/lib/account";
import { db } from "@/lib/db";
import { instagram } from "@/lib/instagram";
import { matchesKeywords } from "@/lib/matching";
import { advanceSession, payloads } from "@/lib/engine/session";
import type { IgMessagingEvent } from "@/lib/engine/types";

const STOP_WORDS = ["stop", "unsubscribe", "बंद"];
const START_WORDS = ["start", "subscribe"];
const OPEN_SESSION_DAYS = 7;

async function findContact(senderId: string) {
  return db.contact.findFirst({ where: { OR: [{ igsid: senderId }, { dmIgsid: senderId }] } });
}

export async function handleMessage(event: IgMessagingEvent, accountIgUserId: string) {
  const senderId = event.sender.id;
  if (event.message?.is_echo || event.message?.is_deleted) return "echo";
  if (senderId === accountIgUserId) return "own_message";

  const account = await getAccount();
  if (senderId === account.igUserId) return "own_message";

  const payload = event.message?.quick_reply?.payload ?? event.postback?.payload;
  const text = event.message?.text ?? event.postback?.title ?? "";

  // Global keywords work from anywhere.
  if (!payload && matchesKeywords(text, STOP_WORDS)) {
    const contact = await findContact(senderId);
    await db.contact.upsert({
      where: { id: contact?.id ?? "__none__" },
      create: { igsid: senderId, optedOut: true },
      update: { optedOut: true },
    });
    await instagram.sendMessage(
      account.accessToken,
      account.igUserId,
      senderId,
      "Done. You won't get automatic messages from us any more. Send START to turn them back on.",
    );
    return "opted_out";
  }
  if (!payload && matchesKeywords(text, START_WORDS)) {
    const contact = await findContact(senderId);
    if (contact?.optedOut) {
      await db.contact.update({ where: { id: contact.id }, data: { optedOut: false } });
      await instagram.sendMessage(account.accessToken, account.igUserId, senderId, "You're back on. Welcome!");
      return "opted_in";
    }
  }

  // A tap on one of our buttons carries the session ID.
  const parsed = payloads.parse(payload);
  if (parsed) return advanceSession(parsed.sessionId, senderId, parsed.action);

  // Typed text continues the person's latest open session (covers the "reply link" fallback).
  const contact = await findContact(senderId);
  if (!contact) return "no_session";
  const since = new Date(Date.now() - OPEN_SESSION_DAYS * 24 * 3600 * 1000);
  const open = await db.linkSession.findFirst({
    where: {
      contactId: contact.id,
      status: { in: ["AWAITING_TAP", "AWAITING_FOLLOW"] },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!open) return "no_session";
  return advanceSession(open.id, senderId, "TEXT");
}
