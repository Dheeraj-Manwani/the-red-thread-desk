import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import type { FbFeedValue, WebhookBody } from "@/lib/engine/types";
import { messageDedupeKey, saveAndProcess, validSignature, verifySubscription, type CollectedEvent } from "@/lib/webhooks";

export const maxDuration = 60;

/** Page webhooks (object "page"): feed comments and Messenger messages. */
export function GET(request: NextRequest) {
  return verifySubscription(request, process.env.FACEBOOK_VERIFY_TOKEN || process.env.INSTAGRAM_VERIFY_TOKEN);
}

function collect(body: WebhookBody) {
  const events: CollectedEvent[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "feed") continue;
      const v = change.value as FbFeedValue;
      if (v?.item !== "comment" || v.verb !== "add" || !v.comment_id || !v.post_id || !v.from?.id) continue;
      events.push({
        dedupeKey: `fb:comment:${v.comment_id}`,
        stored: {
          kind: "comment",
          channel: "FACEBOOK",
          accountId: entry.id,
          comment: {
            id: v.comment_id,
            mediaId: v.post_id,
            text: v.message ?? "",
            // Top-level comments have parent_id = post_id.
            parentId: v.parent_id && v.parent_id !== v.post_id ? v.parent_id : undefined,
            fromId: v.from.id,
            fromName: v.from.name,
          },
        },
      });
    }
    for (const m of entry.messaging ?? []) {
      events.push({
        dedupeKey: messageDedupeKey("fb", m),
        stored: { kind: "message", channel: "FACEBOOK", accountId: entry.id, value: m },
      });
    }
  }
  return events;
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"), env().FACEBOOK_APP_SECRET)) {
    return new Response("Invalid signature", { status: 401 });
  }
  let body: WebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (body.object !== "page") return new Response("EVENT_RECEIVED");

  await saveAndProcess("facebook", collect(body));
  return new Response("EVENT_RECEIVED");
}
