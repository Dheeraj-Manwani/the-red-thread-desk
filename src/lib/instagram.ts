import {
  graphCall,
  messageBody,
  carouselBody,
  type CarouselCard,
  type GraphMethod,
  type GraphOptions,
  type IceBreakerAction,
  type QuickReply,
  type SendResult,
} from "@/lib/graph";

/**
 * Instagram API on graph.facebook.com with a system-user token ("API setup with Unified login" in the
 * Meta app dashboard). New Meta apps can't use Instagram Login any more, and graph.instagram.com rejects
 * these tokens. Calls address the Instagram professional account by its ID; no Facebook Page is involved.
 * Verified live (Nov 2026): GET /{ig-id}, /{ig-id}/media, /{ig-id}/conversations, /{ig-id}/subscribed_apps.
 */
const BASE = "https://graph.facebook.com";

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
  /** The account itself. A system-user token's /me is the system user, so the ID comes from INSTAGRAM_ACCOUNT_ID. */
  account(token: string, igUserId: string) {
    return call<{ id: string; username: string; name?: string }>(token, "GET", igUserId, {
      query: { fields: "id,username,name" },
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

  /** Generic template (carousel). Inside the 24 h window only. */
  sendCarousel(token: string, igUserId: string, recipientId: string, cards: CarouselCard[]) {
    return call<SendResult>(token, "POST", `${igUserId}/messages`, {
      body: { recipient: { id: recipientId }, message: carouselBody(cards) },
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
  setIceBreakers(token: string, igUserId: string, actions: IceBreakerAction[]) {
    if (actions.length === 0) {
      return call<{ result?: string }>(token, "DELETE", `${igUserId}/messenger_profile`, {
        body: { platform: "instagram", fields: ["ice_breakers"] },
      });
    }
    return call<{ result?: string }>(token, "POST", `${igUserId}/messenger_profile`, {
      body: { platform: "instagram", ice_breakers: [{ call_to_actions: actions, locale: "default" }] },
    });
  },
};
