import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import type { MessagingEvent, WaStatus, WaTemplateUpdate } from "@/lib/engine/types";
import { saveAndProcess, validSignature, verifySubscription, type CollectedEvent } from "@/lib/webhooks";

export const maxDuration = 60;

/** WhatsApp Cloud API webhook (object "whatsapp_business_account"). Signed with the Meta app secret. */
export function GET(request: NextRequest) {
  return verifySubscription(request, process.env.WHATSAPP_VERIFY_TOKEN || process.env.INSTAGRAM_VERIFY_TOKEN);
}

type WaMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  button?: { payload?: string; text?: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  image?: { id: string; caption?: string };
  document?: { id: string; filename?: string; caption?: string };
  video?: { id: string; caption?: string };
  audio?: { id: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
};

type WaValue = {
  messaging_product?: string;
  metadata?: { phone_number_id: string; display_phone_number?: string };
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  messages?: WaMessage[];
  statuses?: WaStatus[];
  /** Coexistence: messages you send from the WhatsApp Business app on your phone. */
  message_echoes?: (WaMessage & { to: string })[];
} & Partial<WaTemplateUpdate>;

type WaBody = { object: string; entry?: { id: string; changes?: { field: string; value: WaValue }[] }[] };

/** One WhatsApp message in the engine's Messenger-style shape. */
function toEvent(m: WaMessage, phoneId: string, name: string | undefined, echoTo?: string): MessagingEvent {
  const reply = m.interactive?.button_reply ?? m.interactive?.list_reply;
  const media = m.image ?? m.document ?? m.video ?? m.audio;
  const caption = m.image?.caption ?? m.document?.caption ?? m.video?.caption;
  const location = m.location
    ? `https://maps.google.com/?q=${m.location.latitude},${m.location.longitude}`
    : undefined;
  return {
    sender: echoTo ? { id: phoneId } : { id: m.from, name },
    recipient: { id: echoTo ?? phoneId },
    timestamp: Number(m.timestamp) * 1000,
    message: {
      mid: m.id,
      text: m.text?.body ?? reply?.title ?? m.button?.text ?? caption ?? location,
      ...(echoTo ? { is_echo: true } : {}),
      ...(reply ? { quick_reply: { payload: reply.id } } : m.button?.payload ? { quick_reply: { payload: m.button.payload } } : {}),
      // Media needs the token to download: the app proxies wa-media:<id> at /api/whatsapp/media/<id>.
      ...(media ? { attachments: [{ type: m.type, payload: { url: `wa-media:${media.id}` } }] } : {}),
    },
  };
}

function collect(body: WaBody) {
  const events: CollectedEvent[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (change.field === "message_template_status_update" && v.message_template_name && v.event) {
        const update: WaTemplateUpdate = {
          event: v.event,
          message_template_id: v.message_template_id,
          message_template_name: v.message_template_name,
          message_template_language: v.message_template_language ?? "",
          reason: v.reason,
        };
        events.push({
          dedupeKey: `wa:tpl:${update.message_template_name}:${update.message_template_language}:${update.event}:${Date.now()}`,
          stored: { kind: "wa_template", update },
        });
        continue;
      }
      const phoneId = v.metadata?.phone_number_id;
      if (!phoneId) continue;
      if (change.field === "messages") {
        const names = new Map(v.contacts?.map((c) => [c.wa_id, c.profile?.name]) ?? []);
        for (const m of v.messages ?? []) {
          events.push({
            dedupeKey: `wa:msg:${m.id}`,
            stored: { kind: "message", channel: "WHATSAPP", accountId: phoneId, value: toEvent(m, phoneId, names.get(m.from)) },
          });
        }
        for (const s of v.statuses ?? []) {
          events.push({ dedupeKey: `wa:status:${s.id}:${s.status}`, stored: { kind: "wa_status", status: s } });
        }
      }
      if (change.field === "smb_message_echoes") {
        for (const m of v.message_echoes ?? []) {
          events.push({
            dedupeKey: `wa:echo:${m.id}`,
            stored: { kind: "message", channel: "WHATSAPP", accountId: phoneId, value: toEvent(m, phoneId, undefined, m.to) },
          });
        }
      }
    }
  }
  return events;
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"), env().FACEBOOK_APP_SECRET)) {
    return new Response("Invalid signature", { status: 401 });
  }
  let body: WaBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (body.object !== "whatsapp_business_account") return new Response("EVENT_RECEIVED");
  await saveAndProcess("whatsapp", collect(body));
  return new Response("EVENT_RECEIVED");
}
