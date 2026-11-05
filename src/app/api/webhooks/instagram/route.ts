import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import type { IgCommentValue, WebhookBody } from "@/lib/engine/types";
import { messageDedupeKey, saveAndProcess, validSignature, verifySubscription, type CollectedEvent } from "@/lib/webhooks";

export const maxDuration = 60;

export function GET(request: NextRequest) {
  return verifySubscription(request, process.env.INSTAGRAM_VERIFY_TOKEN);
}

function collect(body: WebhookBody) {
  const events: CollectedEvent[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments" && change.field !== "live_comments") continue;
      const v = change.value as IgCommentValue;
      if (!v?.id || !v.from?.id || !v.media?.id) continue;
      events.push({
        dedupeKey: `ig:comment:${v.id}`,
        stored: {
          kind: "comment",
          channel: "INSTAGRAM",
          accountId: entry.id,
          comment: {
            id: v.id,
            mediaId: v.media.id,
            text: v.text ?? "",
            parentId: v.parent_id,
            fromId: v.from.id,
            fromName: v.from.username,
          },
        },
      });
    }
    for (const m of entry.messaging ?? []) {
      events.push({
        dedupeKey: messageDedupeKey("ig", m),
        stored: { kind: "message", channel: "INSTAGRAM", accountId: entry.id, value: m },
      });
    }
  }
  return events;
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"), env().META_APP_SECRET)) {
    return new Response("Invalid signature", { status: 401 });
  }
  let body: WebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (body.object !== "instagram") return new Response("EVENT_RECEIVED");

  // Save first, answer Meta at once, process after the response.
  await saveAndProcess("instagram", collect(body));
  return new Response("EVENT_RECEIVED");
}
