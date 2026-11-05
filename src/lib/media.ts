import type { Channel } from "@/generated/prisma/client";
import { getAccount } from "@/lib/account";
import { facebook } from "@/lib/facebook";
import { instagram } from "@/lib/instagram";

/** A post or reel from either channel, for pickers and stats labels. */
export type MediaItem = {
  id: string;
  label: string;
  caption?: string;
  thumbnail?: string;
  permalink?: string;
  date: string;
};

export async function loadRecentMedia(channel: Channel, limit = 30): Promise<{ items: MediaItem[]; error: string | null }> {
  try {
    const account = await getAccount(channel);
    if (channel === "INSTAGRAM") {
      const { data } = await instagram.recentMedia(account.accessToken, account.externalId, limit);
      return {
        items: data.map((m) => ({
          id: m.id,
          label: m.media_product_type === "REELS" ? "Reel" : m.media_type.toLowerCase(),
          caption: m.caption,
          thumbnail: m.thumbnail_url ?? m.media_url,
          permalink: m.permalink,
          date: m.timestamp.slice(0, 10),
        })),
        error: null,
      };
    }
    const { data } = await facebook.recentPosts(account.accessToken, account.externalId, limit);
    return {
      items: data.map((p) => ({
        id: p.id,
        label: "post",
        caption: p.message,
        thumbnail: p.full_picture,
        permalink: p.permalink_url,
        date: p.created_time.slice(0, 10),
      })),
      error: null,
    };
  } catch (error) {
    return { items: [], error: error instanceof Error ? error.message : String(error) };
  }
}
