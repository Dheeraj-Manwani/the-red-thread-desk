"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getAccount, refreshAccountToken } from "@/lib/account";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { instagram } from "@/lib/instagram";
import { lines, list } from "@/lib/matching";

const triggerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  active: z.boolean(),
  scope: z.enum(["POSTS", "ALL_POSTS", "DEFAULT"]),
  mediaIds: z.array(z.string()),
  keywords: z.array(z.string()),
  excludeWords: z.array(z.string()),
  publicReplies: z.array(z.string().max(2200)),
  dmText: z.string().trim().min(1, "DM text is required").max(1000),
  dmButtonText: z.string().trim().min(1).max(20, "Button text: 20 characters max"),
  followGate: z.boolean(),
  followPromptText: z.string().trim().min(1).max(1000),
  followButtonText: z.string().trim().min(1).max(20, "Button text: 20 characters max"),
  linkUrl: z.string().trim().url("Link must be a full URL (https://...)"),
  linkMessage: z.string().trim().min(1).max(900),
  oncePerPerson: z.boolean(),
  priority: z.coerce.number().int().min(-100).max(100),
});

function parseTrigger(form: FormData) {
  const mediaIds = [...form.getAll("mediaIds").map(String), ...list(form.get("extraMediaIds"))];
  const parsed = triggerSchema.safeParse({
    name: form.get("name"),
    active: form.get("active") === "on",
    scope: form.get("scope"),
    mediaIds: [...new Set(mediaIds)],
    keywords: list(form.get("keywords")),
    excludeWords: list(form.get("excludeWords")),
    publicReplies: lines(form.get("publicReplies")),
    dmText: form.get("dmText"),
    dmButtonText: form.get("dmButtonText"),
    followGate: form.get("followGate") === "on",
    followPromptText: form.get("followPromptText"),
    followButtonText: form.get("followButtonText"),
    linkUrl: form.get("linkUrl"),
    linkMessage: form.get("linkMessage"),
    oncePerPerson: form.get("oncePerPerson") === "on",
    priority: form.get("priority") || 0,
  });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  if (parsed.data.scope === "POSTS" && parsed.data.mediaIds.length === 0) {
    throw new Error("Pick at least one post, or change the scope to all posts.");
  }
  return parsed.data;
}

export async function saveTrigger(form: FormData) {
  await requireAdmin();
  const data = parseTrigger(form);
  const id = form.get("id");
  if (typeof id === "string" && id) {
    await db.commentTrigger.update({ where: { id }, data });
  } else {
    await db.commentTrigger.create({ data });
  }
  redirect("/triggers");
}

export async function toggleTrigger(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  const trigger = await db.commentTrigger.findUniqueOrThrow({ where: { id } });
  await db.commentTrigger.update({ where: { id }, data: { active: !trigger.active } });
  redirect("/triggers");
}

export async function deleteTrigger(form: FormData) {
  await requireAdmin();
  await db.commentTrigger.delete({ where: { id: String(form.get("id")) } });
  redirect("/triggers");
}

export async function subscribeWebhooks() {
  await requireAdmin();
  const account = await getAccount();
  await instagram.subscribeWebhooks(account.accessToken, account.igUserId);
  redirect("/settings?subscribed=1");
}

export async function refreshToken() {
  await requireAdmin();
  await refreshAccountToken();
  redirect("/settings?refreshed=1");
}
