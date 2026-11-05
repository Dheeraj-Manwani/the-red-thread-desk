import type { Channel, Contact, MessageDirection, MessageSource } from "@/generated/prisma/client";
import { db, isUniqueViolation } from "@/lib/db";
import { sendPush } from "@/lib/push";

/** How long the bot stays quiet after you take over or reply by hand. */
export const HANDOFF_HOURS = 24;
/** Meta's standard messaging window after the person's last message. */
export const REPLY_WINDOW_HOURS = 24;
const NOTIFY_EVERY_MS = 5 * 60_000;

const hours = (n: number) => n * 3_600_000;

export function inHandoff(contact: Pick<Contact, "handoffUntil">, now = new Date()) {
  return Boolean(contact.handoffUntil && contact.handoffUntil > now);
}

export function replyWindowOpen(contact: Pick<Contact, "lastInboundAt">, now = new Date()) {
  return Boolean(contact.lastInboundAt && now.getTime() - contact.lastInboundAt.getTime() < hours(REPLY_WINDOW_HOURS));
}

/** Saves a DM and bumps the contact's timestamps. Returns null for a duplicate (same mid). */
export async function recordMessage(m: {
  channel: Channel;
  contactId: string;
  direction: MessageDirection;
  source: MessageSource;
  text: string;
  buttons?: string[];
  mid?: string;
}) {
  const now = new Date();
  try {
    const row = await db.message.create({
      data: { ...m, buttons: m.buttons ?? [], mid: m.mid ?? null, createdAt: now },
    });
    await db.contact.update({
      where: { id: m.contactId },
      data: { lastMessageAt: now, ...(m.direction === "IN" ? { lastInboundAt: now } : {}) },
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

/** Bot goes quiet for HANDOFF_HOURS. `asked` marks it as waiting for your reply. */
export function startHandoff(contactId: string, { asked = false } = {}) {
  return db.contact.update({
    where: { id: contactId },
    data: {
      handoffUntil: new Date(Date.now() + hours(HANDOFF_HOURS)),
      ...(asked ? { handoffAskedAt: new Date() } : {}),
    },
  });
}

export function endHandoff(contactId: string) {
  return db.contact.update({ where: { id: contactId }, data: { handoffUntil: null, handoffAskedAt: null } });
}

export function displayName(contact: Pick<Contact, "channel" | "username" | "name" | "externalId">) {
  if (contact.username) return contact.channel === "INSTAGRAM" ? `@${contact.username}` : contact.username;
  return contact.name ?? `Contact ${contact.externalId.slice(-6)}`;
}

/** Push to your devices, at most once per contact every 5 minutes unless `urgent`. */
export async function notifyAbout(contact: Contact, title: string, body: string, { urgent = false } = {}) {
  const now = new Date();
  if (!urgent && contact.lastNotifiedAt && now.getTime() - contact.lastNotifiedAt.getTime() < NOTIFY_EVERY_MS) return;
  await db.contact.update({ where: { id: contact.id }, data: { lastNotifiedAt: now } });
  try {
    await sendPush({ title, body: body.slice(0, 180), url: `/inbox/${contact.id}`, tag: contact.id });
  } catch (error) {
    console.warn("[push] notify failed", error);
  }
}
