import { env } from "@/lib/env";

/** Instagram API with Instagram Login. Docs: developers.facebook.com/docs/instagram-platform */
const BASE = "https://graph.instagram.com";

export class InstagramApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: number,
    public subcode?: number,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

type Query = Record<string, string | number | undefined>;

async function call<T>(
  token: string,
  method: "GET" | "POST",
  path: string,
  { query, body }: { query?: Query; body?: unknown } = {},
): Promise<T> {
  const url = new URL(`${BASE}/${env().GRAPH_API_VERSION}/${path.replace(/^\//, "")}`);
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
    throw new InstagramApiError(
      json.error?.message ?? `Instagram API ${res.status}`,
      res.status,
      json.error?.code,
      json.error?.error_subcode,
    );
  }
  return json;
}

export type QuickReply = { title: string; payload: string };

function message(text: string, quickReplies?: QuickReply[]) {
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

export const instagram = {
  me(token: string) {
    return call<{ user_id: string; username: string; id: string }>(token, "GET", "me", {
      query: { fields: "user_id,username" },
    });
  },

  /** One DM per comment, within 7 days of the comment. */
  privateReply(token: string, igUserId: string, commentId: string, text: string, quickReplies?: QuickReply[]) {
    return call<{ recipient_id: string; message_id: string }>(token, "POST", `${igUserId}/messages`, {
      body: { recipient: { comment_id: commentId }, message: message(text, quickReplies) },
    });
  },

  /** Only inside the 24 h window opened by the person's last message. */
  sendMessage(token: string, igUserId: string, recipientId: string, text: string, quickReplies?: QuickReply[]) {
    return call<{ recipient_id: string; message_id: string }>(token, "POST", `${igUserId}/messages`, {
      body: { recipient: { id: recipientId }, message: message(text, quickReplies) },
    });
  },

  replyToComment(token: string, commentId: string, text: string) {
    return call<{ id: string }>(token, "POST", `${commentId}/replies`, { query: { message: text } });
  },

  /** Needs consent: the person must have messaged you, tapped an ice breaker or used the menu. */
  userProfile(token: string, igsid: string) {
    return call<{ username?: string; name?: string; is_user_follow_business?: boolean }>(token, "GET", igsid, {
      query: { fields: "username,name,is_user_follow_business" },
    });
  },

  recentMedia(token: string, igUserId: string, limit = 30) {
    return call<{
      data: {
        id: string;
        caption?: string;
        media_type: string;
        media_product_type?: string;
        media_url?: string;
        thumbnail_url?: string;
        permalink: string;
        timestamp: string;
      }[];
    }>(token, "GET", `${igUserId}/media`, {
      query: {
        fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp",
        limit,
      },
    });
  },

  subscribeWebhooks(token: string, igUserId: string) {
    return call<{ success: boolean }>(token, "POST", `${igUserId}/subscribed_apps`, {
      query: { subscribed_fields: "comments,messages" },
    });
  },

  /** Long-lived tokens last 60 days; refreshing returns a fresh 60-day token. */
  async refreshToken(token: string) {
    const url = new URL(`${BASE}/refresh_access_token`);
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", token);
    const res = await fetch(url, { cache: "no-store" });
    const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: { message?: string } };
    if (!res.ok || !json.access_token) {
      throw new InstagramApiError(json.error?.message ?? "Token refresh failed", res.status);
    }
    return { accessToken: json.access_token, expiresIn: json.expires_in ?? 60 * 24 * 3600 };
  },
};
