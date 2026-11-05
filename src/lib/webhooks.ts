import { createHmac, timingSafeEqual } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { db, isUniqueViolation } from "@/lib/db";
import { processEvent } from "@/lib/engine/process";
import type { MessagingEvent, StoredEvent } from "@/lib/engine/types";

export type CollectedEvent = { dedupeKey: string; stored: StoredEvent };

/** Meta calls GET once when you save the webhook URL in the app dashboard. */
export function verifySubscription(request: NextRequest, verifyToken: string | undefined) {
  const params = request.nextUrl.searchParams;
  if (verifyToken && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === verifyToken) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export function validSignature(raw: string, header: string | null, secret: string | undefined) {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const given = header.slice(7);
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}

export function messageDedupeKey(prefix: string, m: MessagingEvent) {
  return `${prefix}:msg:${m.message?.mid ?? m.postback?.mid ?? `${m.sender.id}:${m.timestamp}`}`;
}

/** Saves each event (duplicates are skipped), then processes them after the response. */
export async function saveAndProcess(source: string, events: CollectedEvent[]) {
  const saved: string[] = [];
  for (const e of events) {
    try {
      const row = await db.webhookEvent.create({
        data: {
          source,
          kind: e.stored.kind,
          dedupeKey: e.dedupeKey,
          payload: JSON.parse(JSON.stringify(e.stored)),
        },
      });
      saved.push(row.id);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  after(async () => {
    for (const id of saved) await processEvent(id);
  });
}
