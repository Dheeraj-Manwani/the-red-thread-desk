"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { Channel } from "@/generated/prisma/client";
import { getAccount, reloadAccountFromEnv } from "@/lib/account";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { facebook } from "@/lib/facebook";
import { MAX_ICE_BREAKERS, publishIceBreakers } from "@/lib/engine/icebreakers";
import { instagram } from "@/lib/instagram";
import { getClient } from "@/lib/channels";
import { endHandoff, replyWindowOpen, startHandoff } from "@/lib/inbox";
import { sendPush } from "@/lib/push";
import { INTENTS } from "@/lib/ai";
import { whatsapp } from "@/lib/whatsapp";
import { after } from "next/server";
import {
  audienceWhere,
  estimateCost,
  processBroadcasts,
  submitTemplate,
  syncTemplates,
  variableCount,
  type VariableSource,
} from "@/lib/broadcasts";
import { syncCatalogue } from "@/lib/catalogue";
import { createOrderWithLink, orderLabel } from "@/lib/orders";
import { createPaymentLink } from "@/lib/razorpay";
import { emptyGraph, validateGraph, type FlowGraph } from "@/lib/flows/graph";
import { lines, list } from "@/lib/matching";

const channelSchema = z.enum(["INSTAGRAM", "FACEBOOK", "WHATSAPP"]);

const triggerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  active: z.boolean(),
  channel: channelSchema,
  kind: z.enum(["COMMENT", "STORY_REPLY", "DM_KEYWORD"]),
  intents: z.array(z.enum(INTENTS)),
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
    intents: form.getAll("intents").map(String),
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
    if (data.kind === "STORY_REPLY") throw new Error("Story replies are Instagram only.");
    data.followGate = false; // No follow check on Facebook.
  }
  if (data.channel === "WHATSAPP") {
    if (data.kind !== "DM_KEYWORD") throw new Error("WhatsApp has keyword automations only.");
    data.followGate = false;
  }
  if (data.kind !== "DM_KEYWORD") data.intents = [];
  if (data.kind === "DM_KEYWORD" && data.keywords.length === 0 && data.intents.length === 0) {
    throw new Error("Add at least one keyword or AI intent, so it doesn't answer every message.");
  }
  if (data.kind === "STORY_REPLY" || data.kind === "DM_KEYWORD") {
    if (data.scope === "POSTS") throw new Error("Pick every story / every DM, or default.");
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
  else if (channel === "FACEBOOK") await facebook.subscribeWebhooks(account.accessToken, account.externalId);
  else {
    const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    if (!waba) throw new Error("Set WHATSAPP_BUSINESS_ACCOUNT_ID first.");
    await whatsapp.subscribeWebhooks(account.accessToken, waba);
  }
  redirect(`/settings?subscribed=${channel}`);
}

export async function reloadToken(form: FormData) {
  await requireAdmin();
  const channel = channelFrom(form);
  await reloadAccountFromEnv(channel);
  redirect(`/settings?reloaded=${channel}`);
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

// ---------- Inbox (phase 4) ----------

/** Reply from the inbox. Counts as you taking over: the bot pauses for HANDOFF_HOURS. */
export async function sendReply(form: FormData) {
  await requireAdmin();
  const contactId = String(form.get("contactId"));
  const text = z.string().trim().min(1, "Write a message first").max(1000).parse(form.get("text"));
  const contact = await db.contact.findUniqueOrThrow({ where: { id: contactId } });
  if (!replyWindowOpen(contact)) {
    throw new Error("Meta only allows replies within 24 hours of the person's last message.");
  }
  const client = await getClient(contact.channel);
  await client.sendMessage(contact.dmId ?? contact.externalId, text, undefined, "ADMIN");
  await startHandoff(contact.id);
  await db.contact.update({ where: { id: contact.id }, data: { handoffAskedAt: null, lastReadAt: new Date() } });
  redirect(`/inbox/${contact.id}`);
}

export async function takeOver(form: FormData) {
  await requireAdmin();
  const id = String(form.get("contactId"));
  await startHandoff(id);
  redirect(`/inbox/${id}`);
}

export async function handBack(form: FormData) {
  await requireAdmin();
  const id = String(form.get("contactId"));
  await endHandoff(id);
  redirect(`/inbox/${id}`);
}

export async function addContactTag(form: FormData) {
  await requireAdmin();
  const contactId = String(form.get("contactId"));
  const name = z.string().trim().toLowerCase().min(1).max(40).parse(form.get("tag"));
  const tag = await db.tag.upsert({ where: { name }, create: { name }, update: {} });
  await db.contactTag.upsert({
    where: { contactId_tagId: { contactId, tagId: tag.id } },
    create: { contactId, tagId: tag.id },
    update: {},
  });
  redirect(`/inbox/${contactId}`);
}

export async function removeContactTag(form: FormData) {
  await requireAdmin();
  const contactId = String(form.get("contactId"));
  await db.contactTag.deleteMany({ where: { contactId, tagId: String(form.get("tagId")) } });
  redirect(`/inbox/${contactId}`);
}

const pushSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

/** Called from the browser after it subscribes. */
export async function savePushSubscription(subscription: unknown, userAgent: string) {
  await requireAdmin();
  const { endpoint, keys } = pushSchema.parse(subscription);
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent.slice(0, 300) },
    update: { p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent.slice(0, 300) },
  });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  await requireAdmin();
  await db.pushSubscription.deleteMany({ where: { endpoint } });
  return { ok: true };
}

export async function sendTestPush() {
  await requireAdmin();
  return sendPush({ title: "Red Thread", body: "Notifications are working.", url: "/inbox", tag: "test" });
}

// ---------- Sales (phase 5) ----------

export async function syncCatalogueNow() {
  await requireAdmin();
  let target = "/catalogue?failed=1";
  try {
    const r = await syncCatalogue();
    target = `/catalogue?synced=${r.synced}&skipped=${r.skipped}&off=${r.deactivated}`;
  } catch (error) {
    console.error("[catalogue] sync failed", error);
  }
  redirect(target);
}

export async function toggleCarousel(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  const item = await db.catalogueItem.findUniqueOrThrow({ where: { id } });
  await db.catalogueItem.update({ where: { id }, data: { showInCarousel: !item.showInCarousel } });
  redirect("/catalogue");
}

const stageSchema = z.enum(["LEAD", "PAYMENT_SENT", "PAID", "DETAILS", "IN_PROGRESS", "DELIVERED", "CANCELLED"]);

/** Called from the Kanban board when a card is dropped on another column. */
export async function moveOrderStage(orderId: string, stage: string) {
  await requireAdmin();
  await db.order.update({ where: { id: orderId }, data: { stage: stageSchema.parse(stage) } });
  return { ok: true };
}

export async function updateOrder(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  const details = Object.fromEntries(
    lines(form.get("details"))
      .map((l) => {
        const i = l.indexOf(":");
        return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : ["", ""];
      })
      .filter(([k, v]) => k && v)
      .map(([k, v]) => [k.toLowerCase().replace(/[^a-z0-9_]+/g, "_"), v]),
  );
  const eventDate = String(form.get("eventDate") ?? "");
  await db.order.update({
    where: { id },
    data: {
      stage: stageSchema.parse(form.get("stage")),
      notes: String(form.get("notes") ?? "").trim() || null,
      eventDate: eventDate ? new Date(`${eventDate}T00:00:00Z`) : null,
      details,
    },
  });
  redirect(`/orders/${id}?saved=1`);
}

/** Status message to the customer ("Your invite is ready", "Edits done"), inside the 24 h window. */
export async function sendOrderMessage(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  const text = z.string().trim().min(1, "Write a message first").max(1000).parse(form.get("text"));
  const order = await db.order.findUniqueOrThrow({ where: { id }, include: { contact: true } });
  if (!replyWindowOpen(order.contact)) {
    throw new Error("Meta only allows messages within 24 hours of the customer's last message.");
  }
  const client = await getClient(order.channel);
  await client.sendMessage(order.contact.dmId ?? order.contact.externalId, text, undefined, "ADMIN");
  redirect(`/orders/${id}?sent=1`);
}

/** For payments taken outside Razorpay (UPI to your number, cash). */
export async function markOrderPaid(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  const order = await db.order.findUniqueOrThrow({ where: { id } });
  await db.order.update({
    where: { id },
    data: {
      paymentStatus: "PAID",
      paidAt: order.paidAt ?? new Date(),
      ...(order.stage === "LEAD" || order.stage === "PAYMENT_SENT" ? { stage: "PAID" as const } : {}),
    },
  });
  redirect(`/orders/${id}`);
}

/** From the inbox: pick a package (or type an amount), create the order + link, send it. */
export async function sendPaymentLink(form: FormData) {
  await requireAdmin();
  const contactId = String(form.get("contactId"));
  const contact = await db.contact.findUniqueOrThrow({ where: { id: contactId } });
  if (!replyWindowOpen(contact)) throw new Error("Meta only allows messages within 24 hours of their last message.");

  const packageId = String(form.get("packageId") ?? "");
  let choice: { title: string; amountInr: number; packageId?: string };
  if (packageId) {
    const p = await db.package.findUniqueOrThrow({ where: { id: packageId } });
    choice = { title: p.name, amountInr: p.priceInr, packageId: p.id };
  } else {
    choice = {
      title: z.string().trim().min(1, "Say what the payment is for").max(80).parse(form.get("title")),
      amountInr: z.coerce.number().int().min(1, "Amount must be at least ₹1").parse(form.get("amountInr")),
    };
  }
  const order = await createOrderWithLink({ contact, ...choice });
  const client = await getClient(contact.channel);
  await client.sendMessage(
    contact.dmId ?? contact.externalId,
    `Here's your secure payment link for ${order.title} (₹${order.amountInr.toLocaleString("en-IN")}):\n\n${order.razorpayLinkUrl}\n\nOrder ${orderLabel(order)}`,
    undefined,
    "ADMIN",
  );
  redirect(`/inbox/${contact.id}`);
}

/** New link for an order whose link expired or was cancelled. */
export async function renewPaymentLink(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  const order = await db.order.findUniqueOrThrow({ where: { id }, include: { contact: true } });
  if (order.paymentStatus === "PAID") throw new Error("This order is already paid.");
  const link = await createPaymentLink({
    amountInr: order.amountInr,
    description: `${order.title} · Red Thread · ${orderLabel(order)}`,
    referenceId: `${order.id}.${Date.now().toString(36)}`,
    notes: { order: orderLabel(order), contact: order.contactId },
  });
  await db.order.update({
    where: { id },
    data: { razorpayLinkId: link.id, razorpayLinkUrl: link.short_url, paymentStatus: "UNPAID", stage: "PAYMENT_SENT" },
  });
  redirect(`/orders/${id}?renewed=1`);
}

// ---------- WhatsApp templates and broadcasts (phase 6) ----------

export async function syncTemplatesNow() {
  await requireAdmin();
  let target = "/broadcasts?tab=templates&failed=1";
  try {
    target = `/broadcasts?tab=templates&synced=${await syncTemplates()}`;
  } catch (error) {
    console.error("[templates] sync failed", error);
  }
  redirect(target);
}

export async function createTemplate(form: FormData) {
  await requireAdmin();
  const body = z.string().trim().min(1, "Body is required").max(1024).parse(form.get("body"));
  const count = variableCount([{ type: "BODY", text: body }]);
  const examples = lines(form.get("examples"));
  if (examples.length < count) throw new Error(`Give one example per variable ({{1}}…{{${count}}}), one per line.`);
  await submitTemplate({
    name: z
      .string()
      .trim()
      .regex(/^[a-z0-9_]{1,512}$/, "Name: lowercase letters, digits and _ only")
      .parse(form.get("name")),
    language: z.string().trim().min(2).max(10).parse(form.get("language")),
    category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]).parse(form.get("category")),
    body,
    examples: examples.slice(0, count),
    footer: String(form.get("footer") ?? "").trim().slice(0, 60) || undefined,
    quickReplies: lines(form.get("quickReplies")).slice(0, 3).map((q) => q.slice(0, 25)),
  });
  redirect("/broadcasts?tab=templates&submitted=1");
}

export async function createBroadcast(form: FormData) {
  await requireAdmin();
  const templateId = String(form.get("templateId"));
  const template = await db.waTemplate.findUniqueOrThrow({ where: { id: templateId } });
  if (template.status !== "APPROVED") throw new Error("Only approved templates can be broadcast.");
  const tag = String(form.get("tag") ?? "").trim().toLowerCase() || null;
  const count = variableCount(template.components);
  const variables: VariableSource[] = Array.from({ length: count }, (_, i) => {
    const raw = String(form.get(`var${i + 1}`) ?? "").trim();
    if (raw === "{name}") return { kind: "name" };
    const field = raw.match(/^\{(\w+)\}$/);
    return field ? { kind: "field", field: field[1] } : { kind: "text", value: raw };
  });
  const recipients = await db.contact.count({ where: audienceWhere(tag) });
  if (recipients === 0) throw new Error("Nobody in this audience has opted in to WhatsApp offers yet.");
  const when = String(form.get("scheduledAt") ?? "");
  const broadcast = await db.broadcast.create({
    data: {
      name: z.string().trim().min(1, "Name is required").max(80).parse(form.get("name")),
      templateId,
      tag,
      variables,
      // datetime-local is the admin's local time (India).
      scheduledAt: when ? new Date(`${when}:00+05:30`) : null,
      status: "DRAFT",
      estimatedCostInr: estimateCost(recipients, template.category),
    },
  });
  redirect(`/broadcasts?review=${broadcast.id}`);
}

/** Confirms a reviewed draft: schedules it, or sends now when no time was set. */
export async function confirmBroadcast(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  const b = await db.broadcast.findUniqueOrThrow({ where: { id } });
  if (b.status !== "DRAFT") redirect("/broadcasts");
  const now = !b.scheduledAt || b.scheduledAt <= new Date();
  await db.broadcast.update({ where: { id }, data: { status: "SCHEDULED", scheduledAt: b.scheduledAt ?? new Date() } });
  if (now) after(() => processBroadcasts(50_000).catch((e) => console.error("[broadcast] send failed", e)));
  redirect("/broadcasts");
}

export async function cancelBroadcast(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  await db.broadcast.updateMany({
    where: { id, status: { in: ["DRAFT", "SCHEDULED", "SENDING"] } },
    data: { status: "CANCELLED", finishedAt: new Date() },
  });
  redirect("/broadcasts");
}

/** For consent given in chat (or withdrawn): you are responsible for having it. */
export async function setMarketingOptIn(form: FormData) {
  await requireAdmin();
  const contactId = String(form.get("contactId"));
  const on = form.get("on") === "1";
  await db.contact.update({ where: { id: contactId }, data: { marketingOptInAt: on ? new Date() : null } });
  redirect(`/inbox/${contactId}`);
}
