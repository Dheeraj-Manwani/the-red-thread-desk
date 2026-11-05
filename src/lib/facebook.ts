import {
  graphCall,
  messageBody,
  type GraphMethod,
  type GraphOptions,
  type IceBreakerAction,
  type QuickReply,
  type SendResult,
} from "@/lib/graph";

/** Facebook Pages + Messenger Platform, called with a Page access token. */
const BASE = "https://graph.facebook.com";

const call = <T>(token: string, method: GraphMethod, path: string, opts?: GraphOptions) =>
  graphCall<T>(BASE, token, method, path, opts);

export type FacebookPost = {
  id: string;
  message?: string;
  full_picture?: string;
  permalink_url?: string;
  created_time: string;
};

export const facebook = {
  /** With a Page token, /me is the Page. */
  me(token: string) {
    return call<{ id: string; name: string }>(token, "GET", "me", { query: { fields: "id,name" } });
  },

  /** One Messenger message per comment, within 7 days of the comment. */
  privateReply(token: string, pageId: string, commentId: string, text: string, quickReplies?: QuickReply[]) {
    return call<SendResult>(token, "POST", `${pageId}/messages`, {
      body: { recipient: { comment_id: commentId }, message: messageBody(text, quickReplies) },
    });
  },

  /** Only inside the 24 h window opened by the person's last message. */
  sendMessage(token: string, pageId: string, psid: string, text: string, quickReplies?: QuickReply[]) {
    return call<SendResult>(token, "POST", `${pageId}/messages`, {
      body: { recipient: { id: psid }, messaging_type: "RESPONSE", message: messageBody(text, quickReplies) },
    });
  },

  replyToComment(token: string, commentId: string, text: string) {
    return call<{ id: string }>(token, "POST", `${commentId}/comments`, { body: { message: text } });
  },

  recentPosts(token: string, pageId: string, limit = 30) {
    return call<{ data: FacebookPost[] }>(token, "GET", `${pageId}/posts`, {
      query: { fields: "id,message,full_picture,permalink_url,created_time", limit },
    });
  },

  subscribeWebhooks(token: string, pageId: string) {
    return call<{ success: boolean }>(token, "POST", `${pageId}/subscribed_apps`, {
      query: { subscribed_fields: "feed,messages,messaging_postbacks" },
    });
  },

  /** Up to 4 questions on a new Messenger thread. Taps arrive as postbacks. */
  setIceBreakers(token: string, actions: IceBreakerAction[]) {
    if (actions.length === 0) {
      return call<{ result?: string }>(token, "DELETE", "me/messenger_profile", {
        body: { fields: ["ice_breakers"] },
      });
    }
    return call<{ result?: string }>(token, "POST", "me/messenger_profile", {
      body: { ice_breakers: [{ call_to_actions: actions, locale: "default" }] },
    });
  },
};
