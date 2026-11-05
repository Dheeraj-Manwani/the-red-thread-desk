"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { Channel } from "@/generated/prisma/client";
import { getAccount, refreshInstagramToken, reloadAccountFromEnv } from "@/lib/account";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { facebook } from "@/lib/facebook";
import { MAX_ICE_BREAKERS, publishIceBreakers } from "@/lib/engine/icebreakers";
import { instagram } from "@/lib/instagram";
import { emptyGraph, validateGraph, type FlowGraph } from "@/lib/flows/graph";
import { lines, list } from "@/lib/matching";

const channelSchema = z.enum(["INSTAGRAM", "FACEBOOK"]);

const triggerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  active: z.boolean(),
  channel: channelSchema,
  kind: z.enum(["COMMENT", "STORY_REPLY"]),
  scope: z.enum(["POSTS", "ALL_POSTS", "DEFAULT"]),
  mediaIds: z.array(z.string()),
  keywords: z.array(z.string()),
  excludeWords: z.array(z.string()),
  publicReplies: z.array(z.string().max(2200)),
  flowId: z.string().nullable(),
  dmText: z.string().trim().max(1000),
  dmButtonText: z.string().trim().min(1).max(20, "Button text: 20 characters max"),
  followGate: z.boolean(),
  followPromptText: z.string().trim().min(1).max(1000),
  followButtonText: z.string().trim().min(1).max(20, "Button text: 20 characters max"),
  linkUrl: z.union([z.literal(""), z.string().trim().url("Link must be a full URL (https://...)")]),
  linkMessage: z.string().trim().min(1).max(900),
  oncePerPerson: z.boolean(),
  priority: z.coerce.number().int().min(-100).max(100),
});

function parseTrigger(form: FormData) {
  const mediaIds = [...form.getAll("mediaIds").map(String), ...list(form.get("extraMediaIds"))];
  const parsed = triggerSchema.safeParse({
    name: form.get("name"),
    active: form.get("active") === "on",
    channel: form.get("channel"),
    kind: form.get("kind"),
    scope: form.get("scope"),
    mediaIds: [...new Set(mediaIds)],
    keywords: list(form.get("keywords")),
    excludeWords: list(form.get("excludeWords")),
    publicReplies: lines(form.get("publicReplies")),
    flowId: form.get("flowId") || null,
    dmText: form.get("dmText") ?? "",
    dmButtonText: form.get("dmButtonText") || "Send me the link",
    followGate: form.get("followGate") === "on",
    followPromptText: form.get("followPromptText") || "Follow us first, then tap the button below.",
    followButtonText: form.get("followButtonText") || "I've followed",
    linkUrl: String(form.get("linkUrl") ?? "").trim(),
    linkMessage: form.get("linkMessage"),
    oncePerPerson: form.get("oncePerPerson") === "on",
    priority: form.get("priority") || 0,
  });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;

  // Without a flow, the fixed journey needs its DM and link.
  if (!data.flowId) {
    if (!data.dmText) throw new Error("DM text is required (or pick a flow).");
    if (!data.linkUrl) throw new Error("Link is required (or pick a flow).");
  }
  if (data.channel === "FACEBOOK") {
    if (data.kind !== "COMMENT") throw new Error("Story replies are Instagram only.");
    data.followGate = false; // No follow check on Facebook.
  }
  if (data.kind === "STORY_REPLY") {
    if (data.scope === "POSTS") throw new Error("Story automations apply to every story: pick all stories or default.");
    data.mediaIds = [];
    data.publicReplies = [];
  }
  if (data.scope === "POSTS" && data.mediaIds.length === 0) {
    throw new Error("Pick at least one post, or change the scope to all posts.");
  }
  return data;
}

export async function saveTrigger(form: FormData) {
  await requireAdmin();
  const data = parseTrigger(form);
  const id = form.get("id");
  if (typeof id === "string" && id) {
    // Channel and kind are fixed once created (undefined = leave as is).
    await db.trigger.update({ where: { id }, data: { ...data, channel: undefined, kind: undefined } });
  } else {
    await db.trigger.create({ data });
  }
  redirect("/triggers");
}

export async function toggleTrigger(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  const trigger = await db.trigger.findUniqueOrThrow({ where: { id } });
  await db.trigger.update({ where: { id }, data: { active: !trigger.active } });
  redirect("/triggers");
}

export async function deleteTrigger(form: FormData) {
  await requireAdmin();
  await db.trigger.delete({ where: { id: String(form.get("id")) } });
  redirect("/triggers");
}

function channelFrom(form: FormData): Channel {
  return channelSchema.parse(form.get("channel"));
}

export async function subscribeWebhooks(form: FormData) {
  await requireAdmin();
  const channel = channelFrom(form);
  const account = await getAccount(channel);
  if (channel === "INSTAGRAM") await instagram.subscribeWebhooks(account.accessToken, account.externalId);
  else await facebook.subscribeWebhooks(account.accessToken, account.externalId);
  redirect(`/settings?subscribed=${channel}`);
}

export async function reloadToken(form: FormData) {
  await requireAdmin();
  const channel = channelFrom(form);
  await reloadAccountFromEnv(channel);
  redirect(`/settings?reloaded=${channel}`);
}

export async function refreshToken() {
  await requireAdmin();
  await refreshInstagramToken();
  redirect("/settings?refreshed=1");
}

const iceBreakerSchema = z.object({
  channel: channelSchema,
  question: z.string().trim().min(1, "Question is required").max(80, "Question: 80 characters max"),
  reply: z.string().trim().max(900),
  linkUrl: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.string().url("Link must be a full URL (https://...)").nullable()),
  flowId: z.string().nullable(),
  position: z.coerce.number().int().min(0).max(99),
});

/** Saves to the database, then publishes the channel's list to Meta. */
async function publishOrReport(channel: Channel) {
  try {
    await publishIceBreakers(channel);
    return `/ice-breakers?published=${channel}`;
  } catch (error) {
    console.error("[ice-breakers] publish failed", channel, error);
    return `/ice-breakers?failed=${channel}`;
  }
}

export async function saveIceBreaker(form: FormData) {
  await requireAdmin();
  const parsed = iceBreakerSchema.safeParse({
    channel: form.get("channel"),
    question: form.get("question"),
    reply: form.get("reply"),
    linkUrl: form.get("linkUrl") ?? "",
    flowId: form.get("flowId") || null,
    position: form.get("position") || 0,
  });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;
  if (!data.flowId && !data.reply) throw new Error("Reply is required (or pick a flow).");

  const id = form.get("id");
  if (typeof id === "string" && id) {
    await db.iceBreaker.update({ where: { id }, data: { ...data, channel: undefined } });
  } else {
    const count = await db.iceBreaker.count({ where: { channel: data.channel } });
    if (count >= MAX_ICE_BREAKERS) throw new Error(`Meta allows ${MAX_ICE_BREAKERS} ice breakers per channel.`);
    await db.iceBreaker.create({ data });
  }
  redirect(await publishOrReport(data.channel));
}

export async function deleteIceBreaker(form: FormData) {
  await requireAdmin();
  const item = await db.iceBreaker.delete({ where: { id: String(form.get("id")) } });
  redirect(await publishOrReport(item.channel));
}

export async function republishIceBreakers(form: FormData) {
  await requireAdmin();
  redirect(await publishOrReport(channelFrom(form)));
}

export async function createFlow(form: FormData) {
  await requireAdmin();
  const name = z.string().trim().min(1, "Name is required").max(80).parse(form.get("name"));
  const flow = await db.flow.create({ data: { name, graph: emptyGraph() } });
  redirect(`/flows/${flow.id}`);
}

/** Called from the builder. Refuses to save a graph with problems, since live automations may use it. */
export async function saveFlow(id: string, name: string, graph: FlowGraph) {
  await requireAdmin();
  const cleanName = name.trim().slice(0, 80);
  const clean: FlowGraph = {
    nodes: graph.nodes.map(({ id, type, position, data }) => ({
      id,
      type,
      position: { x: Number(position?.x) || 0, y: Number(position?.y) || 0 },
      data,
    })) as FlowGraph["nodes"],
    edges: graph.edges.map(({ id, source, sourceHandle, target }) => ({ id, source, sourceHandle: sourceHandle ?? null, target })),
  };
  const problems = [...(cleanName ? [] : ["The flow needs a name."]), ...validateGraph(clean)];
  if (problems.length) return { ok: false, problems };
  await db.flow.update({ where: { id }, data: { name: cleanName, graph: clean } });
  return { ok: true, problems: [] };
}

export async function deleteFlow(form: FormData) {
  await requireAdmin();
  await db.flow.delete({ where: { id: String(form.get("id")) } });
  redirect("/flows");
}

const packageSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40),
  priceInr: z.coerce.number().int().min(0).max(10_000_000),
  url: z.string().trim().url("Link must be a full URL (https://...)"),
  active: z.boolean(),
  position: z.coerce.number().int().min(0).max(99),
});

export async function savePackage(form: FormData) {
  await requireAdmin();
  const parsed = packageSchema.safeParse({
    name: form.get("name"),
    priceInr: form.get("priceInr"),
    url: form.get("url"),
    active: form.get("active") === "on",
    position: form.get("position") || 0,
  });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  const id = form.get("id");
  if (typeof id === "string" && id) await db.package.update({ where: { id }, data: parsed.data });
  else await db.package.create({ data: parsed.data });
  redirect("/packages");
}

export async function deletePackage(form: FormData) {
  await requireAdmin();
  await db.package.delete({ where: { id: String(form.get("id")) } });
  redirect("/packages");
}
