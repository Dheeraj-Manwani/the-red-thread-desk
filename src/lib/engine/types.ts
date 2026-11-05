import type { Channel } from "@/generated/prisma/client";
import type { RazorpayWebhook } from "@/lib/razorpay";

/** Instagram `comments` webhook value (object "instagram"). */
export type IgCommentValue = {
  id: string;
  text?: string;
  parent_id?: string;
  from: { id: string; username?: string; self_ig_scoped_id?: string };
  media: { id: string; media_product_type?: string };
};

/** Facebook Page `feed` webhook value. Only item=comment, verb=add is used. */
export type FbFeedValue = {
  item?: string;
  verb?: string;
  comment_id?: string;
  post_id?: string;
  parent_id?: string;
  message?: string;
  from?: { id: string; name?: string };
};

/** A comment from either channel, in one shape. */
export type InboundComment = {
  id: string;
  /** Instagram media ID or Facebook post ID. */
  mediaId: string;
  text: string;
  parentId?: string;
  fromId: string;
  /** Instagram handle, or Facebook display name. */
  fromName?: string;
};

/** Messaging event. Instagram and Messenger use the same shape for what we read. */
export type MessagingEvent = {
  /** `name` comes with WhatsApp messages (the profile name). */
  sender: { id: string; name?: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    is_unsupported?: boolean;
    quick_reply?: { payload: string };
    /** Instagram story replies carry reply_to.story. */
    reply_to?: { mid?: string; story?: { id: string; url?: string } };
    attachments?: { type: string; payload?: { url?: string } }[];
  };
  postback?: { mid?: string; title?: string; payload?: string };
};

export type WebhookBody = {
  object: string;
  entry?: {
    id: string;
    time: number;
    changes?: { field: string; value: unknown }[];
    messaging?: MessagingEvent[];
  }[];
};

/** What we store per event: the channel and account it arrived for, plus the event itself. */
export type StoredEvent =
  | { kind: "comment"; channel: Channel; accountId: string; comment: InboundComment }
  | { kind: "message"; channel: Channel; accountId: string; value: MessagingEvent }
  | { kind: "razorpay"; event: RazorpayWebhook }
  | { kind: "wa_status"; status: WaStatus }
  | { kind: "wa_template"; update: WaTemplateUpdate };

/** WhatsApp delivery status for a message we sent. */
export type WaStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed" | string;
  recipient_id: string;
  timestamp: string;
  errors?: { code: number; title?: string; message?: string }[];
};

/** message_template_status_update webhook value. */
export type WaTemplateUpdate = {
  event: string;
  message_template_id?: number | string;
  message_template_name: string;
  message_template_language: string;
  reason?: string | null;
};
