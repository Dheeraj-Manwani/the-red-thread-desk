import { env } from "@/lib/env";
import {
  graphCall,
  type CarouselCard,
  type GraphMethod,
  type GraphOptions,
  type IceBreakerAction,
  type QuickReply,
} from "@/lib/graph";

/** WhatsApp Cloud API, on graph.facebook.com with a system user token. */
const BASE = "https://graph.facebook.com";

const call = <T>(token: string, method: GraphMethod, path: string, opts?: GraphOptions) =>
  graphCall<T>(BASE, token, method, path, opts);

export type WaSendResult = { messages?: { id: string }[]; contacts?: { wa_id: string }[] };

/** Reply buttons: 3 max, 20-character titles. Lists: 10 rows max, 24-character titles. */
export const WA_BUTTON_LIMIT = 3;
export const WA_LIST_LIMIT = 10;

export type TemplateComponent = {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: string;
  text?: string;
  buttons?: { type: string; text: string; url?: string }[];
  example?: unknown;
};

export type WaTemplateInfo = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: TemplateComponent[];
  rejected_reason?: string;
};

/** Message body for text + optional choices, picking the right WhatsApp shape. */
export function interactiveBody(text: string, choices?: QuickReply[]) {
  if (!choices?.length) return { type: "text", text: { body: text.slice(0, 4096), preview_url: true } };
  if (choices.length <= WA_BUTTON_LIMIT) {
    return {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: text.slice(0, 1024) },
        action: {
          buttons: choices.map((c) => ({ type: "reply", reply: { id: c.payload.slice(0, 256), title: c.title.slice(0, 20) } })),
        },
      },
    };
  }
  // More than 3 choices: WhatsApp shows them as a list menu.
  return {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: text.slice(0, 1024) },
      action: {
        button: "Choose",
        sections: [
          {
            title: "Options",
            rows: choices.slice(0, WA_LIST_LIMIT).map((c) => ({ id: c.payload.slice(0, 200), title: c.title.slice(0, 24) })),
          },
        ],
      },
    },
  };
}

/**
 * WhatsApp has no carousel for session messages: designs become a list menu,
 * with the preview links written into the message text.
 */
export function carouselAsList(cards: CarouselCard[], intro = "Pick a design:") {
  const previews = cards
    .map((c) => {
      const preview = c.buttons.find((b) => b.type === "web_url");
      return preview && "url" in preview ? `• ${c.title}: ${preview.url}` : null;
    })
    .filter(Boolean)
    .join("\n");
  const rows = cards
    .map((c) => {
      const buy = c.buttons.find((b) => b.type === "postback");
      return buy && "payload" in buy
        ? { id: buy.payload.slice(0, 200), title: c.title.slice(0, 24), description: c.subtitle?.slice(0, 72) }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .slice(0, WA_LIST_LIMIT);
  return {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: `${intro}${previews ? `\n\n${previews}` : ""}`.slice(0, 1024) },
      action: { button: "See designs", sections: [{ title: "Designs", rows }] },
    },
  };
}

export const whatsapp = {
  phoneNumber(token: string, phoneNumberId: string) {
    return call<{ id: string; display_phone_number?: string; verified_name?: string }>(token, "GET", phoneNumberId, {
      query: { fields: "display_phone_number,verified_name" },
    });
  },

  /** Text, buttons or a list. Free inside the 24 h customer service window. */
  send(token: string, phoneNumberId: string, to: string, body: Record<string, unknown>) {
    return call<WaSendResult>(token, "POST", `${phoneNumberId}/messages`, {
      body: { messaging_product: "whatsapp", recipient_type: "individual", to, ...body },
    });
  },

  /** Template message: the only kind allowed outside the 24 h window (charged per message). */
  sendTemplate(token: string, phoneNumberId: string, to: string, name: string, language: string, bodyParams: string[]) {
    return call<WaSendResult>(token, "POST", `${phoneNumberId}/messages`, {
      body: {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name,
          language: { code: language },
          ...(bodyParams.length
            ? { components: [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }] }
            : {}),
        },
      },
    });
  },

  /** Up to 4 "ice breaker" prompts on a new chat. A tap sends the prompt text as a message. */
  setPrompts(token: string, phoneNumberId: string, prompts: IceBreakerAction[]) {
    return call<{ success?: boolean }>(token, "POST", `${phoneNumberId}/conversational_automation`, {
      body: { enable_welcome_message: false, prompts: prompts.map((p) => p.question.slice(0, 80)) },
    });
  },

  /** Media (photos customers send) need the token to download: we proxy them. */
  mediaInfo(token: string, mediaId: string) {
    return call<{ url: string; mime_type: string; file_size?: number }>(token, "GET", mediaId);
  },

  listTemplates(token: string, wabaId: string) {
    return call<{ data: WaTemplateInfo[] }>(token, "GET", `${wabaId}/message_templates`, {
      query: { fields: "id,name,language,status,category,components,rejected_reason", limit: 200 },
    });
  },

  createTemplate(
    token: string,
    wabaId: string,
    t: { name: string; language: string; category: string; components: TemplateComponent[] },
  ) {
    return call<{ id: string; status: string; category: string }>(token, "POST", `${wabaId}/message_templates`, {
      body: t,
    });
  },

  subscribeWebhooks(token: string, wabaId: string) {
    return call<{ success: boolean }>(token, "POST", `${wabaId}/subscribed_apps`);
  },
};

export function whatsappConfigured() {
  const e = env();
  return Boolean(e.WHATSAPP_PHONE_NUMBER_ID && e.WHATSAPP_ACCESS_TOKEN);
}

/** Digits only, with India's 91 in front of a bare 10-digit number. */
export function normalizePhone(raw: string | null | undefined) {
  const digits = raw?.replace(/\D/g, "") ?? "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}
