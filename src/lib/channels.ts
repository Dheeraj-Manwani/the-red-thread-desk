import type { Channel } from "@/generated/prisma/client";
import { getAccount } from "@/lib/account";
import { db } from "@/lib/db";
import { findBySender } from "@/lib/engine/contacts";
import { facebook } from "@/lib/facebook";
import { GraphApiError, type CarouselCard, type IceBreakerAction, type QuickReply, type SendResult } from "@/lib/graph";
import { recordMessage } from "@/lib/inbox";
import { instagram } from "@/lib/instagram";
import { carouselAsList, interactiveBody, whatsapp } from "@/lib/whatsapp";

export const channelLabel = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  WHATSAPP: "WhatsApp",
} as const satisfies Record<Channel, string>;

export type SendSource = "BOT" | "ADMIN";

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
  sendMessage(recipientId: string, text: string, quickReplies?: QuickReply[], source?: SendSource): Promise<void>;
  sendCarousel(recipientId: string, cards: CarouselCard[]): Promise<void>;
  replyToComment(commentId: string, text: string): Promise<string>;
  /** true / false, or null when we could not check (no consent yet, or an API error). */
  checkFollow(userId: string): Promise<boolean | null>;
  setIceBreakers(actions: IceBreakerAction[]): Promise<void>;
};

type Api = {
  privateReply(commentId: string, text: string, quickReplies?: QuickReply[]): Promise<SendResult>;
  sendMessage(recipientId: string, text: string, quickReplies?: QuickReply[]): Promise<SendResult>;
  sendCarousel(recipientId: string, cards: CarouselCard[]): Promise<SendResult>;
  replyToComment(commentId: string, text: string): Promise<{ id: string }>;
  checkFollow(userId: string): Promise<boolean | null>;
  setIceBreakers(actions: IceBreakerAction[]): Promise<unknown>;
};

function instagramApi(token: string, id: string): Api {
  return {
    privateReply: (commentId, text, qr) => instagram.privateReply(token, id, commentId, text, qr),
    sendMessage: (recipientId, text, qr) => instagram.sendMessage(token, id, recipientId, text, qr),
    sendCarousel: (recipientId, cards) => instagram.sendCarousel(token, id, recipientId, cards),
    replyToComment: (commentId, text) => instagram.replyToComment(token, commentId, text),
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
    setIceBreakers: (actions) => instagram.setIceBreakers(token, actions),
  };
}

function facebookApi(token: string, id: string): Api {
  return {
    privateReply: (commentId, text, qr) => facebook.privateReply(token, id, commentId, text, qr),
    sendMessage: (psid, text, qr) => facebook.sendMessage(token, id, psid, text, qr),
    sendCarousel: (psid, cards) => facebook.sendCarousel(token, id, psid, cards),
    replyToComment: (commentId, text) => facebook.replyToComment(token, commentId, text),
    checkFollow: async () => null,
    setIceBreakers: (actions) => facebook.setIceBreakers(token, actions),
  };
}

function whatsappApi(token: string, phoneId: string): Api {
  const noComments = async (): Promise<never> => {
    throw new Error("WhatsApp has no comments.");
  };
  const sent = (r: { messages?: { id: string }[] }) => ({ message_id: r.messages?.[0]?.id });
  return {
    privateReply: noComments,
    replyToComment: noComments,
    sendMessage: async (to, text, qr) => sent(await whatsapp.send(token, phoneId, to, interactiveBody(text, qr))),
    sendCarousel: async (to, cards) => sent(await whatsapp.send(token, phoneId, to, carouselAsList(cards))),
    checkFollow: async () => null,
    setIceBreakers: (actions) => whatsapp.setPrompts(token, phoneId, actions),
  };
}

/** Logging must never break a send that already went out. */
async function logOutbound(
  channel: Channel,
  contactId: string | undefined | null,
  text: string,
  quickReplies: QuickReply[] | undefined,
  mid: string | undefined,
  source: SendSource,
) {
  if (!contactId) return;
  try {
    await recordMessage({
      channel,
      contactId,
      direction: "OUT",
      source,
      text,
      buttons: quickReplies?.map((q) => q.title) ?? [],
      mid,
    });
  } catch (error) {
    console.error("[inbox] could not log outgoing message", error);
  }
}

export async function getClient(channel: Channel): Promise<ChannelClient> {
  const account = await getAccount(channel);
  const api =
    channel === "INSTAGRAM"
      ? instagramApi(account.accessToken, account.externalId)
      : channel === "FACEBOOK"
        ? facebookApi(account.accessToken, account.externalId)
        : whatsappApi(account.accessToken, account.externalId);

  return {
    channel,
    externalId: account.externalId,
    username: account.username,
    canCheckFollow: channel === "INSTAGRAM",
    async privateReply(commentId, text, quickReplies) {
      const res = await api.privateReply(commentId, text, quickReplies);
      const comment = await db.comment.findUnique({ where: { channel_commentId: { channel, commentId } } });
      await logOutbound(channel, comment?.contactId, text, quickReplies, res.message_id, "BOT");
      return { recipientId: res.recipient_id };
    },
    async sendMessage(recipientId, text, quickReplies, source = "BOT") {
      const res = await api.sendMessage(recipientId, text, quickReplies);
      const contact = await findBySender(channel, recipientId);
      await logOutbound(channel, contact?.id, text, quickReplies, res.message_id, source);
    },
    async sendCarousel(recipientId, cards) {
      const res = await api.sendCarousel(recipientId, cards);
      const contact = await findBySender(channel, recipientId);
      const text = `[carousel] ${cards.map((c) => c.title).join(" · ")}`;
      await logOutbound(channel, contact?.id, text, undefined, res.message_id, "BOT");
    },
    async replyToComment(commentId, text) {
      return (await api.replyToComment(commentId, text)).id;
    },
    checkFollow: (userId) => api.checkFollow(userId),
    async setIceBreakers(actions) {
      await api.setIceBreakers(actions);
    },
  };
}
