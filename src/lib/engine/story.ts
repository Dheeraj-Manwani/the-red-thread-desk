import type { Contact } from "@/generated/prisma/client";
import type { ChannelClient } from "@/lib/channels";
import { db } from "@/lib/db";
import { advanceSession } from "@/lib/engine/session";
import { chooseTrigger } from "@/lib/engine/triggers";
import { startFlow } from "@/lib/flows/engine";

/**
 * Instagram story reply. The reply is itself a message, so the 24 h window and consent
 * are already there: send the DM text, then go straight to the follow check and link.
 */
export async function handleStoryReply(
  client: ChannelClient,
  contact: Contact,
  senderId: string,
  storyId: string,
  text: string,
) {
  const triggers = await db.trigger.findMany({
    where: { active: true, channel: client.channel, kind: "STORY_REPLY", scope: { in: ["ALL_POSTS", "DEFAULT"] } },
  });
  const trigger = chooseTrigger(triggers, text);
  if (!trigger) return "no_trigger";
  if (contact.optedOut) return "opted_out";

  if (trigger.oncePerPerson) {
    const where = { triggerId: trigger.id, contactId: contact.id, storyId };
    const already = trigger.flowId
      ? await db.flowRun.findFirst({ where })
      : await db.linkSession.findFirst({ where: { ...where, status: "LINK_SENT" } });
    if (already) return "already_sent";
  }

  if (trigger.flowId) {
    return startFlow({ flowId: trigger.flowId, client, contact, triggerId: trigger.id, storyId, senderId });
  }

  const session = await db.linkSession.create({
    data: { channel: client.channel, contactId: contact.id, triggerId: trigger.id, storyId },
  });
  await client.sendMessage(senderId, trigger.dmText);
  return advanceSession(session.id, senderId, "TAP");
}
