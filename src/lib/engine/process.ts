import { db } from "@/lib/db";
import { handleComment } from "@/lib/engine/comments";
import { handleMessage } from "@/lib/engine/messages";
import type { StoredEvent } from "@/lib/engine/types";

const IGNORED = new Set(["own_comment", "own_message", "echo", "duplicate", "no_session", "ignored"]);

/** Runs one saved webhook event and records the outcome on it. */
export async function processEvent(eventId: string) {
  const event = await db.webhookEvent.findUnique({ where: { id: eventId } });
  if (!event || event.status === "PROCESSED") return;

  const stored = event.payload as unknown as StoredEvent;
  try {
    const result =
      stored.kind === "comment"
        ? await handleComment(stored.channel, stored.comment, stored.accountId)
        : await handleMessage(stored.channel, stored.value, stored.accountId);
    await db.webhookEvent.update({
      where: { id: eventId },
      data: { status: IGNORED.has(result) ? "IGNORED" : "PROCESSED", error: result, processedAt: new Date() },
    });
  } catch (error) {
    console.error("[webhook] processing failed", eventId, error);
    await db.webhookEvent.update({
      where: { id: eventId },
      data: { status: "FAILED", error: error instanceof Error ? error.message : String(error), processedAt: new Date() },
    });
  }
}
