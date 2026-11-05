import { env } from "@/lib/env";

/** Shared fetch wrapper for graph.facebook.com (Instagram, Facebook and WhatsApp all use it). */
export class GraphApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: number,
    public subcode?: number,
  ) {
    super(message);
    this.name = "GraphApiError";
  }
}

export type GraphMethod = "GET" | "POST" | "DELETE";
export type GraphOptions = { query?: Record<string, string | number | undefined>; body?: unknown };

export async function graphCall<T>(
  base: string,
  token: string,
  method: GraphMethod,
  path: string,
  { query, body }: GraphOptions = {},
): Promise<T> {
  const url = new URL(`${base}/${env().GRAPH_API_VERSION}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: number; error_subcode?: number };
  } & T;
  if (!res.ok || json.error) {
    throw new GraphApiError(
      json.error?.message ?? `Graph API ${res.status}`,
      res.status,
      json.error?.code,
      json.error?.error_subcode,
    );
  }
  return json;
}

export function errorText(error: unknown) {
  if (error instanceof GraphApiError) return `${error.code ?? error.status}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

export type QuickReply = { title: string; payload: string };
export type IceBreakerAction = { question: string; payload: string };

/** Message body with optional quick replies (20-character titles). Same shape on Instagram and Messenger. */
export function messageBody(text: string, quickReplies?: QuickReply[]) {
  return {
    text,
    ...(quickReplies?.length
      ? {
          quick_replies: quickReplies.map((q) => ({
            content_type: "text",
            title: q.title.slice(0, 20),
            payload: q.payload,
          })),
        }
      : {}),
  };
}

/** One card of a generic template (carousel). Max 3 buttons; titles 80 characters. */
export type CarouselCard = {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  buttons: ({ type: "web_url"; title: string; url: string } | { type: "postback"; title: string; payload: string })[];
};

/** Generic template body. Same shape on Instagram and Messenger. */
export function carouselBody(cards: CarouselCard[]) {
  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "generic",
        elements: cards.slice(0, 10).map((c) => ({
          title: c.title.slice(0, 80),
          ...(c.subtitle ? { subtitle: c.subtitle.slice(0, 80) } : {}),
          ...(c.imageUrl ? { image_url: c.imageUrl } : {}),
          buttons: c.buttons.slice(0, 3).map((b) => ({ ...b, title: b.title.slice(0, 20) })),
        })),
      },
    },
  };
}

/** Response of a send or private reply. recipient_id is the IGSID / PSID for later DMs. */
export type SendResult = { recipient_id?: string; message_id?: string };
