import { createHmac, timingSafeEqual } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { db, isUniqueViolation } from "@/lib/db";
import { env } from "@/lib/env";
import { processEvent } from "@/lib/engine/process";
import type { IgCommentValue, IgWebhookBody, StoredEvent } from "@/lib/engine/types";

export const maxDuration = 60;

/** Meta calls this once when you save the webhook URL in the app dashboard. */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === env().INSTAGRAM_VERIFY_TOKEN) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function validSignature(raw: string, header: string | null) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", env().INSTAGRAM_APP_SECRET).update(raw).digest("hex");
  const given = header.slice(7);
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}

function collect(body: IgWebhookBody) {
  const events: { dedupeKey: string; stored: StoredEvent }[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments" && change.field !== "live_comments") continue;
      const value = change.value as IgCommentValue;
      if (!value?.id) continue;
      events.push({ dedupeKey: `ig:comment:${value.id}`, stored: { kind: "comment", accountId: entry.id, value } });
    }
    for (const m of entry.messaging ?? []) {
      const mid = m.message?.mid ?? m.postback?.mid ?? `${m.sender.id}:${m.timestamp}`;
      events.push({ dedupeKey: `ig:msg:${mid}`, stored: { kind: "message", accountId: entry.id, value: m } });
    }
  }
  return events;
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: IgWebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (body.object !== "instagram") return new Response("EVENT_RECEIVED");

  // Save first, answer Meta at once, process after the response.
  const saved: string[] = [];
  for (const e of collect(body)) {
    try {
      const row = await db.webhookEvent.create({
        data: {
          source: "instagram",
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

  return new Response("EVENT_RECEIVED");
}
