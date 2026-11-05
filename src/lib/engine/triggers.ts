import type { Trigger } from "@/generated/prisma/client";
import { containsAny, matchesKeywords } from "@/lib/matching";

const SCOPE_ORDER = { POSTS: 0, ALL_POSTS: 1, DEFAULT: 2 } as const;

type Matchable = Pick<Trigger, "scope" | "priority" | "keywords" | "excludeWords">;

/**
 * Post-specific triggers first, then all-posts, then default; higher priority first within each.
 * A default trigger only runs when the post has no trigger of its own.
 * Pass only the triggers that apply (same channel and kind, and POSTS ones for this post).
 */
export function chooseTrigger<T extends Matchable>(triggers: T[], text: string): T | null {
  const sorted = [...triggers].sort((a, b) => SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] || b.priority - a.priority);
  const matches = (t: T) => !containsAny(text, t.excludeWords) && matchesKeywords(text, t.keywords);

  const specific = sorted.filter((t) => t.scope !== "DEFAULT");
  const hit = specific.find(matches);
  if (hit) return hit;
  if (specific.some((t) => t.scope === "POSTS")) return null;
  return sorted.filter((t) => t.scope === "DEFAULT").find(matches) ?? null;
}
