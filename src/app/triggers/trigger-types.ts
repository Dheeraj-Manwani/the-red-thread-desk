import type { Channel, TriggerKind } from "@/generated/prisma/client";

export const triggerTypes = {
  "ig-comment": { channel: "INSTAGRAM", kind: "COMMENT", label: "Instagram comments" },
  "ig-story": { channel: "INSTAGRAM", kind: "STORY_REPLY", label: "Instagram story replies" },
  "fb-comment": { channel: "FACEBOOK", kind: "COMMENT", label: "Facebook comments" },
} as const satisfies Record<string, { channel: Channel; kind: TriggerKind; label: string }>;

export type TriggerTypeKey = keyof typeof triggerTypes;

export function triggerTypeLabel(channel: Channel, kind: TriggerKind) {
  return Object.values(triggerTypes).find((t) => t.channel === channel && t.kind === kind)?.label ?? `${channel} ${kind}`;
}
