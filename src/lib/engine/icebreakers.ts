import type { Channel, Contact } from "@/generated/prisma/client";
import { getClient, type ChannelClient } from "@/lib/channels";
import { db } from "@/lib/db";
import { payloads } from "@/lib/engine/payloads";
import { startFlow } from "@/lib/flows/engine";
import { createShortLink } from "@/lib/shortlink";

export const MAX_ICE_BREAKERS = 4;

/** A tap on an ice breaker. The person asked, so this answers even if they sent STOP earlier. */
export async function handleIceBreaker(client: ChannelClient, contact: Contact, senderId: string, iceBreakerId: string) {
  const item = await db.iceBreaker.findUnique({ where: { id: iceBreakerId } });
  if (!item || item.channel !== client.channel) return "ignored";
  if (item.flowId) return startFlow({ flowId: item.flowId, client, contact, senderId });

  let text = item.reply;
  if (item.linkUrl) {
    const { href } = await createShortLink({ url: item.linkUrl, contactId: contact.id, iceBreakerId: item.id });
    text = `${text}\n\n${href}`;
  }
  await client.sendMessage(senderId, text);
  return "ice_breaker";
}

export function listIceBreakers(channel: Channel) {
  return db.iceBreaker.findMany({ where: { channel }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
}

/** Pushes the saved list to Meta. An empty list removes the ice breakers. */
export async function publishIceBreakers(channel: Channel) {
  const items = (await listIceBreakers(channel)).slice(0, MAX_ICE_BREAKERS);
  const client = await getClient(channel);
  await client.setIceBreakers(items.map((i) => ({ question: i.question, payload: payloads.ice(i.id) })));
}
