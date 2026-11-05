import type { Channel } from "@/generated/prisma/client";
import { getAccount } from "@/lib/account";
import { facebook } from "@/lib/facebook";
import { GraphApiError, type IceBreakerAction, type QuickReply } from "@/lib/graph";
import { instagram } from "@/lib/instagram";

export const channelLabel = { INSTAGRAM: "Instagram", FACEBOOK: "Facebook" } as const satisfies Record<Channel, string>;

/** What the engine needs from a channel. Instagram and Facebook Messenger share the Send API shape. */
export type ChannelClient = {
  channel: Channel;
  /** Our own IG user ID or Page ID. */
  externalId: string;
  username: string | null;
  /** Can we check whether someone follows us? Instagram only. */
  canCheckFollow: boolean;
  /** Returns the person's DM ID (IGSID / PSID) when the API reports it. */
  privateReply(commentId: string, text: string, quickReplies?: QuickReply[]): Promise<{ recipientId?: string }>;
  sendMessage(recipientId: string, text: string, quickReplies?: QuickReply[]): Promise<void>;
  replyToComment(commentId: string, text: string): Promise<string>;
  /** true / false, or null when we could not check (no consent yet, or an API error). */
  checkFollow(userId: string): Promise<boolean | null>;
  setIceBreakers(actions: IceBreakerAction[]): Promise<void>;
};

export async function getClient(channel: Channel): Promise<ChannelClient> {
  const account = await getAccount(channel);
  const token = account.accessToken;
  const id = account.externalId;

  if (channel === "INSTAGRAM") {
    return {
      channel,
      externalId: id,
      username: account.username,
      canCheckFollow: true,
      async privateReply(commentId, text, quickReplies) {
        const res = await instagram.privateReply(token, id, commentId, text, quickReplies);
        return { recipientId: res.recipient_id };
      },
      async sendMessage(recipientId, text, quickReplies) {
        await instagram.sendMessage(token, id, recipientId, text, quickReplies);
      },
      async replyToComment(commentId, text) {
        return (await instagram.replyToComment(token, commentId, text)).id;
      },
      async checkFollow(userId) {
        try {
          const profile = await instagram.userProfile(token, userId);
          return profile.is_user_follow_business ?? null;
        } catch (error) {
          if (error instanceof GraphApiError) {
            console.warn("[follow-check]", error.code, error.subcode, error.message);
            return null;
          }
          throw error;
        }
      },
      async setIceBreakers(actions) {
        await instagram.setIceBreakers(token, actions);
      },
    };
  }

  return {
    channel,
    externalId: id,
    username: account.username,
    canCheckFollow: false,
    async privateReply(commentId, text, quickReplies) {
      const res = await facebook.privateReply(token, id, commentId, text, quickReplies);
      return { recipientId: res.recipient_id };
    },
    async sendMessage(recipientId, text, quickReplies) {
      await facebook.sendMessage(token, id, recipientId, text, quickReplies);
    },
    async replyToComment(commentId, text) {
      return (await facebook.replyToComment(token, commentId, text)).id;
    },
    async checkFollow() {
      return null;
    },
    async setIceBreakers(actions) {
      await facebook.setIceBreakers(token, actions);
    },
  };
}
