import type { Contact, Trigger } from "@/generated/prisma/client";
import type { ChannelClient } from "@/lib/channels";
import { db } from "@/lib/db";
import { advanceSession } from "@/lib/engine/session";
import { chooseTrigger } from "@/lib/engine/triggers";
import { startFlow } from "@/lib/flows/engine";

/**
 * Runs a story-reply or DM-keyword automation. The person just messaged us, so the 24 h window
 * and consent are there: start the flow, or send the DM text and go straight to the follow check and link.
 */
async function runTrigger(client: ChannelClient, contact: Contact, senderId: string, trigger: Trigger, storyId?: string) {
  if (contact.optedOut) return "opted_out";
  if (trigger.oncePerPerson) {
    const where = { triggerId: trigger.id, contactId: contact.id, ...(storyId ? { storyId } : {}) };
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
  if (trigger.dmText.trim()) await client.sendMessage(senderId, trigger.dmText);
  return advanceSession(session.id, senderId, "TAP");
}

const messageTriggers = (client: ChannelClient, kind: "STORY_REPLY" | "DM_KEYWORD") =>
  db.trigger.findMany({
    where: { active: true, channel: client.channel, kind, scope: { in: ["ALL_POSTS", "DEFAULT"] } },
  });

/** Instagram story reply → story automation. */
export async function handleStoryReply(
  client: ChannelClient,
  contact: Contact,
  senderId: string,
  storyId: string,
  text: string,
) {
  const trigger = chooseTrigger(await messageTriggers(client, "STORY_REPLY"), text);
  if (!trigger) return "no_trigger";
  return runTrigger(client, contact, senderId, trigger, storyId);
}

/**
 * A DM that matches a keyword automation. Keyword-less (catch-all) automations are skipped here:
 * they would answer everything, including replies meant for you.
 */
export async function handleDmKeyword(client: ChannelClient, contact: Contact, senderId: string, text: string) {
  const triggers = (await messageTriggers(client, "DM_KEYWORD")).filter((t) => t.keywords.length > 0);
  const trigger = chooseTrigger(triggers, text);
  if (!trigger) return "no_trigger";
  return runTrigger(client, contact, senderId, trigger);
}

/** The AI picked an intent: run the first DM keyword automation that lists it. */
export async function handleIntent(client: ChannelClient, contact: Contact, senderId: string, intent: string) {
  const triggers = await messageTriggers(client, "DM_KEYWORD");
  const trigger = triggers
    .filter((t) => t.intents.includes(intent))
    .sort((a, b) => b.priority - a.priority)[0];
  if (!trigger) return "no_trigger";
  return runTrigger(client, contact, senderId, trigger);
}
