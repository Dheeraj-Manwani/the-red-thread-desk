import {
  graphCall,
  GraphApiError,
  messageBody,
  type GraphMethod,
  type GraphOptions,
  type IceBreakerAction,
  type QuickReply,
  type SendResult,
} from "@/lib/graph";

/** Instagram API with Instagram Login. Docs: developers.facebook.com/docs/instagram-platform */
const BASE = "https://graph.instagram.com";

const call = <T>(token: string, method: GraphMethod, path: string, opts?: GraphOptions) =>
  graphCall<T>(BASE, token, method, path, opts);

export type InstagramMedia = {
  id: string;
  caption?: string;
  media_type: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
};

export const instagram = {
  me(token: string) {
    return call<{ user_id: string; username: string; id: string }>(token, "GET", "me", {
      query: { fields: "user_id,username" },
    });
  },

  /** One DM per comment, within 7 days of the comment. */
  privateReply(token: string, igUserId: string, commentId: string, text: string, quickReplies?: QuickReply[]) {
    return call<SendResult>(token, "POST", `${igUserId}/messages`, {
      body: { recipient: { comment_id: commentId }, message: messageBody(text, quickReplies) },
    });
  },

  /** Only inside the 24 h window opened by the person's last message. */
  sendMessage(token: string, igUserId: string, recipientId: string, text: string, quickReplies?: QuickReply[]) {
    return call<SendResult>(token, "POST", `${igUserId}/messages`, {
      body: { recipient: { id: recipientId }, message: messageBody(text, quickReplies) },
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
    return call<{ data: InstagramMedia[] }>(token, "GET", `${igUserId}/media`, {
      query: {
        fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp",
        limit,
      },
    });
  },

  subscribeWebhooks(token: string, igUserId: string) {
    return call<{ success: boolean }>(token, "POST", `${igUserId}/subscribed_apps`, {
      query: { subscribed_fields: "comments,messages,messaging_postbacks" },
    });
  },

  /** Up to 4 questions. Taps arrive as postbacks (messaging_postbacks field). */
  setIceBreakers(token: string, actions: IceBreakerAction[]) {
    if (actions.length === 0) {
      return call<{ result?: string }>(token, "DELETE", "me/messenger_profile", {
        body: { platform: "instagram", fields: ["ice_breakers"] },
      });
    }
    return call<{ result?: string }>(token, "POST", "me/messenger_profile", {
      body: { platform: "instagram", ice_breakers: [{ call_to_actions: actions, locale: "default" }] },
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
      throw new GraphApiError(json.error?.message ?? "Token refresh failed", res.status);
    }
    return { accessToken: json.access_token, expiresIn: json.expires_in ?? 60 * 24 * 3600 };
  },
};
