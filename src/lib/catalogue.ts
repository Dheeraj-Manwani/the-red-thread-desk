import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Catalogue sync from the Red Thread site.
 *
 * CATALOGUE_URL must return JSON: an array of designs, or an object holding one under
 * `items`, `designs`, `products` or `data`. Field names are matched loosely so most feeds work as is:
 *   id | slug | sku | handle            → externalId (required)
 *   name | title                        → name (required)
 *   occasion | category | type | tag    → occasion
 *   image | image_url | imageUrl | thumbnail | images[0](.src|.url) → imageUrl
 *   preview | preview_url | previewUrl | demo | url | link | permalink → previewUrl
 *   price | price_inr | priceInr | amount (rupees; "₹1,499" is fine) → priceInr
 *   active | published | available | status ("active"/"published")   → active (default true)
 */

type Raw = Record<string, unknown>;

const pick = (o: Raw, keys: string[]) => {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() || undefined : typeof v === "number" ? String(v) : undefined);

function url(v: unknown, base: string): string | undefined {
  const s = str(v) ?? (v && typeof v === "object" ? str((v as Raw).src ?? (v as Raw).url) : undefined);
  if (!s) return undefined;
  try {
    const u = new URL(s, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

function rupees(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  const s = str(v);
  if (!s) return undefined;
  const n = Number(s.replace(/[₹,\s]|rs\.?|inr/gi, ""));
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

function active(o: Raw): boolean {
  const v = pick(o, ["active", "published", "available", "status"]);
  if (v === undefined) return true;
  if (typeof v === "boolean") return v;
  return ["active", "published", "available", "true", "1", "live"].includes(String(v).toLowerCase());
}

export type ParsedItem = {
  externalId: string;
  name: string;
  occasion?: string;
  imageUrl?: string;
  previewUrl?: string;
  priceInr?: number;
  active: boolean;
  raw: Raw;
};

export function parseFeed(json: unknown, base: string): { items: ParsedItem[]; skipped: number } {
  const list = Array.isArray(json)
    ? json
    : (["items", "designs", "products", "data"].map((k) => (json as Raw | null)?.[k]).find(Array.isArray) as
        | unknown[]
        | undefined) ?? [];
  const items: ParsedItem[] = [];
  let skipped = 0;
  for (const entry of list) {
    if (!entry || typeof entry !== "object") {
      skipped++;
      continue;
    }
    const o = entry as Raw;
    const externalId = str(pick(o, ["id", "slug", "sku", "handle"]));
    const name = str(pick(o, ["name", "title"]));
    if (!externalId || !name) {
      skipped++;
      continue;
    }
    const images = o.images;
    items.push({
      externalId,
      name: name.slice(0, 120),
      occasion: str(pick(o, ["occasion", "category", "type", "tag"]))?.slice(0, 60),
      imageUrl: url(pick(o, ["image", "image_url", "imageUrl", "thumbnail"]) ?? (Array.isArray(images) ? images[0] : undefined), base),
      previewUrl: url(pick(o, ["preview", "preview_url", "previewUrl", "demo", "url", "link", "permalink"]), base),
      priceInr: rupees(pick(o, ["price", "price_inr", "priceInr", "amount"])),
      active: active(o),
      raw: o,
    });
  }
  return { items, skipped };
}

export async function syncCatalogue() {
  const { CATALOGUE_URL, CATALOGUE_TOKEN } = env();
  if (!CATALOGUE_URL) throw new Error("Set CATALOGUE_URL to the Red Thread site's designs feed.");
  const res = await fetch(CATALOGUE_URL, {
    headers: { Accept: "application/json", ...(CATALOGUE_TOKEN ? { Authorization: `Bearer ${CATALOGUE_TOKEN}` } : {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Catalogue feed answered ${res.status}`);
  const { items, skipped } = parseFeed(await res.json(), CATALOGUE_URL);
  if (items.length === 0) throw new Error("The feed had no designs with an id and a name. Nothing changed.");

  const now = new Date();
  for (const item of items) {
    const { raw, ...data } = item;
    await db.catalogueItem.upsert({
      where: { externalId: item.externalId },
      create: { ...data, raw: raw as Prisma.InputJsonValue, syncedAt: now },
      update: { ...data, raw: raw as Prisma.InputJsonValue, syncedAt: now },
    });
  }
  // Designs the site no longer lists stop showing; they stay for old orders.
  const removed = await db.catalogueItem.updateMany({
    where: { externalId: { notIn: items.map((i) => i.externalId) }, active: true },
    data: { active: false },
  });
  return { synced: items.length, skipped, deactivated: removed.count };
}
