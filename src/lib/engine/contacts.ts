import type { Channel, Contact } from "@/generated/prisma/client";
import { db, isUniqueViolation } from "@/lib/db";

/** The contact a DM sender belongs to: matched on their DM ID first, then the comment-side ID. */
export async function findBySender(channel: Channel, senderId: string) {
  const byDm = await db.contact.findUnique({ where: { channel_dmId: { channel, dmId: senderId } } });
  return byDm ?? db.contact.findUnique({ where: { channel_externalId: { channel, externalId: senderId } } });
}

/** For people who message first (story reply, ice breaker, STOP). */
export async function findOrCreateBySender(channel: Channel, senderId: string) {
  const existing = await findBySender(channel, senderId);
  if (existing) return existing;
  try {
    return await db.contact.create({ data: { channel, externalId: senderId } });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return db.contact.findUniqueOrThrow({ where: { channel_externalId: { channel, externalId: senderId } } });
  }
}

/** Records the DM-side ID when it differs from the one we know. Ignores a clash with another contact. */
export async function rememberDmId(contact: Pick<Contact, "id" | "externalId" | "dmId">, dmId: string | undefined) {
  if (!dmId || dmId === contact.externalId || dmId === contact.dmId) return;
  try {
    await db.contact.update({ where: { id: contact.id }, data: { dmId } });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
}
