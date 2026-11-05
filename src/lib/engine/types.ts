/** Shapes of the Instagram webhook payloads we use (Instagram API with Instagram Login). */
export type IgCommentValue = {
  id: string;
  text?: string;
  parent_id?: string;
  from: { id: string; username?: string; self_ig_scoped_id?: string };
  media: { id: string; media_product_type?: string };
};

export type IgMessagingEvent = {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    quick_reply?: { payload: string };
  };
  postback?: { mid?: string; title?: string; payload?: string };
};

export type IgWebhookBody = {
  object: string;
  entry?: {
    id: string;
    time: number;
    changes?: { field: string; value: unknown }[];
    messaging?: IgMessagingEvent[];
  }[];
};

/** What we store per event: the account it arrived for, plus the change itself. */
export type StoredEvent =
  | { kind: "comment"; accountId: string; value: IgCommentValue }
  | { kind: "message"; accountId: string; value: IgMessagingEvent };
