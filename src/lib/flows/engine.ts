import type { Contact, FlowRun, FlowRunStatus, Prisma } from "@/generated/prisma/client";
import { getClient, type ChannelClient } from "@/lib/channels";
import { db } from "@/lib/db";
import { rememberDmId } from "@/lib/engine/contacts";
import { payloads } from "@/lib/engine/payloads";
import {
  CAROUSEL_LIMIT,
  MAX_ANSWER_RETRIES,
  MAX_FOLLOW_CHECKS,
  nextNodeId,
  parseGraph,
  QUICK_REPLY_LIMIT,
  type AnswerKind,
  type FlowGraph,
  type FlowNode,
} from "@/lib/flows/graph";
import { errorText, type QuickReply } from "@/lib/graph";
import { displayName, notifyAbout, replyWindowOpen, startHandoff } from "@/lib/inbox";
import { createOrderWithLink, orderLabel, saveOrderDetail } from "@/lib/orders";
import { createShortLink } from "@/lib/shortlink";
import { normalizePhone } from "@/lib/whatsapp";

const MAX_STEPS = 40;
const RECHECK_DELAY_MS = 3000;
const OPEN_RUN_DAYS = 7;
const WAITING: FlowRunStatus[] = [
  "WAITING_BUTTON",
  "WAITING_ANSWER",
  "WAITING_FOLLOW",
  "WAITING_REPLY",
  "WAITING_PAYMENT",
];

type Vars = {
  package?: { id: string; name: string; priceInr: number; url: string };
  design?: { id: string; name: string; priceInr: number | null; previewUrl: string | null };
  /** The order this run is paying for or collecting details for. */
  orderId?: string;
  retries?: Record<string, number>;
  followChecks?: Record<string, number>;
  initialFollower?: boolean | null;
};

type Ctx = {
  client: ChannelClient;
  run: FlowRun;
  graph: FlowGraph;
  contact: Contact;
  vars: Vars;
  /** DM ID to send to; null until the person has messaged (comment entry). */
  senderId: string | null;
  /** Platform comment ID while the one private reply is still unused. */
  privateReplyTo: string | null;
  /** Fallback first DM when the flow pauses before sending anything. */
  openingText: string;
  canSend: boolean;
  recheck: boolean;
  followGained: boolean;
};

/** Thrown when a step needs to message but the 24 h window isn't open yet. */
class PauseForReply extends Error {}

type Outcome = { next: string } | { wait: FlowRunStatus };

const rupees = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function fields(contact: Contact): Record<string, string> {
  return (contact.fields ?? {}) as Record<string, string>;
}

function interpolate(ctx: Ctx, text: string) {
  return text
    .replace(/\{(\w+)\}/g, (_, key: string) => {
      if (key === "username") {
        const name = ctx.contact.username;
        if (!name) return "";
        return ctx.client.channel === "INSTAGRAM" ? `@${name}` : name;
      }
      if (key === "package") return ctx.vars.package?.name ?? "";
      if (key === "design") return ctx.vars.design?.name ?? "";
      if (key === "package_price") return ctx.vars.package ? `₹${rupees.format(ctx.vars.package.priceInr)}` : "";
      return fields(ctx.contact)[key] ?? "";
    })
    .replace(/ {2,}/g, " ")
    .trim();
}

async function send(ctx: Ctx, text: string, quickReplies?: QuickReply[]) {
  if (ctx.privateReplyTo) {
    const commentId = ctx.privateReplyTo;
    ctx.privateReplyTo = null;
    let recipientId: string | undefined;
    try {
      ({ recipientId } = await ctx.client.privateReply(commentId, text, quickReplies));
    } catch (error) {
      if (!quickReplies?.length) throw error;
      // Quick replies may not be allowed on private replies: ask for a typed answer instead.
      const options = quickReplies.map((q) => q.title).join(" / ");
      ({ recipientId } = await ctx.client.privateReply(commentId, `${text}\n\nReply with: ${options}`));
      console.warn("[flow] private reply without buttons:", errorText(error));
    }
    await rememberDmId(ctx.contact, recipientId);
    if (ctx.run.commentId) {
      await db.comment.update({ where: { id: ctx.run.commentId }, data: { dmSentAt: new Date() } });
    }
    ctx.canSend = false;
    return;
  }
  if (!ctx.canSend || !ctx.senderId) throw new PauseForReply();
  await ctx.client.sendMessage(ctx.senderId, text, quickReplies);
}

function validAnswer(kind: AnswerKind, raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  switch (kind) {
    case "number": {
      const n = text.replace(/[,\s₹]/g, "");
      return /^\d+(\.\d+)?$/.test(n) ? n : null;
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text.toLowerCase() : null;
    case "phone": {
      const digits = text.replace(/[^\d+]/g, "");
      return /^\+?\d{10,15}$/.test(digits) ? digits : null;
    }
    case "url":
      return /^https?:\/\/\S+$/i.test(text) ? text : /^\S+\.\S+$/.test(text) ? `https://${text}` : null;
    case "date":
      return /\d/.test(text) || /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(text) ? text : null;
    default:
      return text.slice(0, 500);
  }
}

async function setField(ctx: Ctx, field: string, value: string) {
  const next = { ...fields(ctx.contact), [field]: value };
  // A "phone" answer links this contact to the same person on other channels (WhatsApp).
  const phone = field === "phone" ? normalizePhone(value) : null;
  ctx.contact = await db.contact.update({
    where: { id: ctx.contact.id },
    data: { fields: next, ...(phone ? { phone } : {}) },
  });
  // Answers after a payment are order details too (couple_names, venue, event_date...).
  if (ctx.vars.orderId) await saveOrderDetail(ctx.vars.orderId, field, value);
}

async function carouselDesigns(ctx: Ctx, occasion: string) {
  const wanted = interpolate(ctx, occasion).trim();
  return db.catalogueItem.findMany({
    where: {
      active: true,
      showInCarousel: true,
      ...(wanted ? { occasion: { contains: wanted, mode: "insensitive" } } : {}),
    },
    orderBy: [{ position: "asc" }, { priceInr: "asc" }],
    take: CAROUSEL_LIMIT,
  });
}

async function paymentLink(ctx: Ctx) {
  if (!ctx.vars.orderId) return null;
  const order = await db.order.findUnique({ where: { id: ctx.vars.orderId } });
  return order?.paymentStatus === "UNPAID" ? order : null;
}

async function tagIds(names: string[]) {
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim().toLowerCase();
    if (!name) continue;
    const tag = await db.tag.upsert({ where: { name }, create: { name }, update: {} });
    ids.push(tag.id);
  }
  return ids;
}

async function activePackages() {
  return db.package.findMany({
    where: { active: true },
    orderBy: [{ position: "asc" }, { priceInr: "asc" }],
    take: QUICK_REPLY_LIMIT,
  });
}

function packageTitle(p: { name: string; priceInr: number }) {
  return `${p.name} ₹${rupees.format(p.priceInr)}`.slice(0, 20);
}

async function execNode(ctx: Ctx, node: FlowNode): Promise<Outcome> {
  const runId = ctx.run.id;
  switch (node.type) {
    case "start":
      return { next: "next" };

    case "message": {
      const buttons = node.data.buttons.map((b) => ({ title: b.title, payload: payloads.flow(runId, node.id, b.id) }));
      await send(ctx, interpolate(ctx, node.data.text), buttons);
      return buttons.length ? { wait: "WAITING_BUTTON" } : { next: "next" };
    }

    case "question":
      await send(ctx, interpolate(ctx, node.data.text));
      return { wait: "WAITING_ANSWER" };

    case "packages": {
      const list = await activePackages();
      if (list.length === 0) {
        console.warn("[flow] package picker has no active packages; skipping", node.id);
        return { next: "next" };
      }
      await send(
        ctx,
        interpolate(ctx, node.data.text),
        list.map((p) => ({ title: packageTitle(p), payload: payloads.flow(runId, node.id, p.id) })),
      );
      return { wait: "WAITING_BUTTON" };
    }

    case "followGate": {
      if (!ctx.client.canCheckFollow) return { next: "yes" };
      if (!ctx.canSend || !ctx.senderId) throw new PauseForReply();
      let follows = await ctx.client.checkFollow(ctx.senderId);
      if (follows === false && ctx.recheck) {
        await new Promise((r) => setTimeout(r, RECHECK_DELAY_MS));
        follows = await ctx.client.checkFollow(ctx.senderId);
      }
      if (follows !== null) {
        await db.contact.update({ where: { id: ctx.contact.id }, data: { isFollower: follows } });
        ctx.vars.initialFollower ??= follows;
      }
      if (follows === true) {
        if (ctx.vars.initialFollower === false) ctx.followGained = true;
        return { next: "yes" };
      }
      const checks = (ctx.vars.followChecks?.[node.id] ?? 0) + 1;
      ctx.vars.followChecks = { ...ctx.vars.followChecks, [node.id]: checks };
      if (checks > MAX_FOLLOW_CHECKS) return { next: "no" };

      const handle = ctx.client.username ? `@${ctx.client.username}` : "us";
      if (follows === null) {
        await send(ctx, `Almost there! Reply "done" here and we'll continue.`);
      } else {
        const text = checks === 1 ? interpolate(ctx, node.data.promptText) : `We can't see the follow yet. Follow ${handle}, then tap the button again.`;
        await send(ctx, text, [{ title: node.data.buttonText, payload: payloads.flow(runId, node.id, "recheck") }]);
      }
      return { wait: "WAITING_FOLLOW" };
    }

    case "link": {
      const url = (node.data.usePackage && ctx.vars.package?.url) || node.data.url;
      if (!url) {
        console.warn("[flow] link node has no URL (no package chosen?); skipping", node.id);
        return { next: "next" };
      }
      const { href } = await createShortLink({
        url,
        contactId: ctx.contact.id,
        triggerId: ctx.run.triggerId ?? undefined,
        flowRunId: runId,
      });
      await send(ctx, `${interpolate(ctx, node.data.text)}\n\n${href}`);
      return { next: "next" };
    }

    case "tag": {
      const add = await tagIds(node.data.add);
      const remove = await tagIds(node.data.remove);
      for (const tagId of add) {
        await db.contactTag.upsert({
          where: { contactId_tagId: { contactId: ctx.contact.id, tagId } },
          create: { contactId: ctx.contact.id, tagId },
          update: {},
        });
      }
      if (remove.length) await db.contactTag.deleteMany({ where: { contactId: ctx.contact.id, tagId: { in: remove } } });
      return { next: "next" };
    }

    case "designs": {
      // Carousels can't go in a private reply: open the conversation first.
      if (ctx.privateReplyTo || !ctx.canSend || !ctx.senderId) throw new PauseForReply();
      const list = await carouselDesigns(ctx, node.data.occasion);
      if (list.length === 0) {
        console.warn("[flow] design carousel has no designs to show; skipping", node.id);
        return { next: "next" };
      }
      if (node.data.text.trim()) await send(ctx, interpolate(ctx, node.data.text));
      await ctx.client.sendCarousel(
        ctx.senderId,
        list.map((d) => ({
          title: d.name,
          subtitle: [d.priceInr ? `₹${rupees.format(d.priceInr)}` : "", d.occasion ?? ""].filter(Boolean).join(" · "),
          imageUrl: d.imageUrl ?? undefined,
          buttons: [
            ...(d.previewUrl ? [{ type: "web_url" as const, title: "Preview", url: d.previewUrl }] : []),
            { type: "postback" as const, title: "Buy", payload: payloads.flow(runId, node.id, d.id) },
          ],
        })),
      );
      return { wait: "WAITING_BUTTON" };
    }

    case "optIn": {
      await send(ctx, interpolate(ctx, node.data.text), [
        { title: node.data.yesTitle, payload: payloads.flow(runId, node.id, "yes") },
        { title: node.data.noTitle, payload: payloads.flow(runId, node.id, "no") },
      ]);
      return { wait: "WAITING_BUTTON" };
    }

    case "payment": {
      // Re-entering the step (e.g. after a pause) reuses the unpaid order instead of making another.
      let order = await paymentLink(ctx);
      if (!order) {
        const d = node.data;
        const choice =
          d.amount === "package" && ctx.vars.package
            ? { title: ctx.vars.package.name, amountInr: ctx.vars.package.priceInr, packageId: ctx.vars.package.id }
            : d.amount === "design" && ctx.vars.design?.priceInr
              ? { title: ctx.vars.design.name, amountInr: ctx.vars.design.priceInr, designId: ctx.vars.design.id }
              : d.amount === "fixed"
                ? { title: d.description.trim(), amountInr: Math.round(d.fixedInr) }
                : null;
        if (!choice) throw new Error(`Payment step: no ${d.amount} chosen before it, so there is no amount.`);
        order = await createOrderWithLink({ contact: ctx.contact, flowRunId: runId, ...choice });
        ctx.vars.orderId = order.id;
      }
      await send(ctx, `${interpolate(ctx, node.data.text)}\n\n${order.razorpayLinkUrl}\n\nOrder ${orderLabel(order)}`);
      return { wait: "WAITING_PAYMENT" };
    }

    case "handoff": {
      await send(ctx, interpolate(ctx, node.data.text));
      ctx.contact = await startHandoff(ctx.contact.id, { asked: true });
      await notifyAbout(ctx.contact, `${displayName(ctx.contact)} is waiting for you`, "Handed off by a flow.", {
        urgent: true,
      });
      return { next: "end" }; // No output: the flow ends here.
    }

    case "condition": {
      const d = node.data;
      let result = false;
      if (d.check === "tag") {
        const name = d.tag.trim().toLowerCase();
        result = Boolean(await db.contactTag.findFirst({ where: { contactId: ctx.contact.id, tag: { name } } }));
      } else if (d.check === "field") {
        const value = fields(ctx.contact)[d.field] ?? "";
        result = d.equals.trim() ? value.trim().toLowerCase() === d.equals.trim().toLowerCase() : value.trim() !== "";
      } else {
        result = ctx.contact.isFollower === true;
      }
      return { next: result ? "true" : "false" };
    }
  }
}

async function save(ctx: Ctx, data: { status: FlowRunStatus; nodeId: string | null; error?: string }) {
  ctx.run = await db.flowRun.update({
    where: { id: ctx.run.id },
    data: {
      ...data,
      vars: ctx.vars as Prisma.InputJsonValue,
      followGained: ctx.run.followGained || ctx.followGained,
      finishedAt: data.status === "DONE" || data.status === "FAILED" ? new Date() : null,
    },
  });
}

/** Runs nodes from `nodeId` until one waits or the flow ends. */
async function runFrom(ctx: Ctx, nodeId: string | null) {
  let current = nodeId;
  for (let step = 0; current && step < MAX_STEPS; step++) {
    const node = ctx.graph.nodes.find((n) => n.id === current);
    if (!node) break;
    let outcome: Outcome;
    try {
      outcome = await execNode(ctx, node);
    } catch (error) {
      if (!(error instanceof PauseForReply)) throw error;
      // Nothing sent yet on a comment entry: use the one private reply to open the conversation.
      if (ctx.privateReplyTo) await send(ctx, ctx.openingText);
      await save(ctx, { status: "WAITING_REPLY", nodeId: node.id });
      return "flow_waiting";
    }
    if ("wait" in outcome) {
      await save(ctx, { status: outcome.wait, nodeId: node.id });
      return "flow_waiting";
    }
    current = nextNodeId(ctx.graph, node.id, outcome.next);
  }
  await save(ctx, { status: "DONE", nodeId: null });
  return "flow_done";
}

async function guarded(ctx: Ctx, fn: () => Promise<string>) {
  try {
    return await fn();
  } catch (error) {
    await save(ctx, { status: "FAILED", nodeId: ctx.run.nodeId, error: errorText(error) }).catch(() => {});
    throw error;
  }
}

export async function startFlow(opts: {
  flowId: string;
  client: ChannelClient;
  contact: Contact;
  triggerId?: string;
  /** Comment entry: our Comment row and the platform comment ID for the private reply. */
  comment?: { rowId: string; platformId: string };
  storyId?: string;
  /** DM entry (story reply, ice breaker): who to message. */
  senderId?: string;
  openingText?: string;
}) {
  const flow = await db.flow.findUnique({ where: { id: opts.flowId } });
  if (!flow) return "flow_missing";
  const graph = parseGraph(flow.graph);
  const start = graph.nodes.find((n) => n.type === "start");
  if (!start) return "flow_invalid";

  // One conversation at a time: a new flow supersedes older waiting runs.
  await db.flowRun.updateMany({
    where: { contactId: opts.contact.id, status: { in: WAITING } },
    data: { status: "DONE", finishedAt: new Date(), error: "superseded" },
  });

  const run = await db.flowRun.create({
    data: {
      channel: opts.client.channel,
      flowId: flow.id,
      contactId: opts.contact.id,
      triggerId: opts.triggerId,
      commentId: opts.comment?.rowId,
      storyId: opts.storyId,
      nodeId: start.id,
    },
  });
  const ctx: Ctx = {
    client: opts.client,
    run,
    graph,
    contact: opts.contact,
    vars: {},
    senderId: opts.senderId ?? null,
    privateReplyTo: opts.comment?.platformId ?? null,
    openingText: opts.openingText || "Thanks for your comment! Reply here to continue.",
    canSend: Boolean(opts.senderId),
    recheck: false,
    followGained: false,
  };
  return guarded(ctx, () => runFrom(ctx, start.id));
}

/** Continues a waiting run after the person taps a button or sends a message. */
export async function resumeFlow(
  runId: string,
  inbound: { senderId: string; text: string; payload?: { nodeId: string; handle: string }; attachments?: string[] },
) {
  const run = await db.flowRun.findUnique({ where: { id: runId }, include: { flow: true, contact: true } });
  if (!run || !WAITING.includes(run.status) || run.contact.optedOut) return "ignored";
  const { flow, contact, ...rest } = run;
  const graph = parseGraph(flow.graph);
  const node = graph.nodes.find((n) => n.id === run.nodeId);
  const client = await getClient(run.channel);
  const ctx: Ctx = {
    client,
    run: rest,
    graph,
    contact,
    vars: (run.vars ?? {}) as Vars,
    senderId: inbound.senderId,
    privateReplyTo: null,
    openingText: "",
    canSend: true,
    recheck: inbound.payload?.handle === "recheck",
    followGained: false,
  };
  await rememberDmId(contact, inbound.senderId);

  return guarded(ctx, async () => {
    if (!node) return runFrom(ctx, null);
    // A tap on an older node's button: ignore it rather than jump around the flow.
    if (inbound.payload && inbound.payload.nodeId !== node.id) return "stale_button";

    switch (run.status) {
      case "WAITING_REPLY":
      case "WAITING_FOLLOW":
        return runFrom(ctx, node.id);

      case "WAITING_BUTTON": {
        const typed = inbound.text.trim().toLowerCase();
        if (node.type === "packages") {
          const list = await activePackages();
          const chosen =
            list.find((p) => p.id === inbound.payload?.handle) ??
            list.find((p) => typed && (p.name.toLowerCase() === typed || packageTitle(p).toLowerCase() === typed));
          if (!chosen) return runFrom(ctx, node.id); // Ask again.
          ctx.vars.package = { id: chosen.id, name: chosen.name, priceInr: chosen.priceInr, url: chosen.url };
          await setField(ctx, node.data.field, chosen.name);
          return runFrom(ctx, nextNodeId(graph, node.id, "next"));
        }
        if (node.type === "optIn") {
          const handle =
            inbound.payload?.handle ??
            (typed === node.data.yesTitle.trim().toLowerCase() || ["yes", "haan", "ha", "ok"].includes(typed)
              ? "yes"
              : typed === node.data.noTitle.trim().toLowerCase() || ["no", "nahi", "na"].includes(typed)
                ? "no"
                : null);
          if (!handle) return runFrom(ctx, node.id);
          // Explicit consent is what makes WhatsApp marketing broadcasts allowed for this person.
          ctx.contact = await db.contact.update({
            where: { id: ctx.contact.id },
            data: { marketingOptInAt: handle === "yes" ? new Date() : null },
          });
          return runFrom(ctx, nextNodeId(graph, node.id, handle));
        }
        if (node.type === "designs") {
          const list = await carouselDesigns(ctx, node.data.occasion);
          const chosen =
            list.find((d) => d.id === inbound.payload?.handle) ??
            (await db.catalogueItem.findFirst({ where: { id: inbound.payload?.handle ?? "__none__" } })) ??
            list.find((d) => typed && d.name.toLowerCase() === typed);
          if (!chosen) return runFrom(ctx, node.id);
          ctx.vars.design = { id: chosen.id, name: chosen.name, priceInr: chosen.priceInr, previewUrl: chosen.previewUrl };
          await setField(ctx, node.data.field, chosen.name);
          return runFrom(ctx, nextNodeId(graph, node.id, "next"));
        }
        if (node.type === "message") {
          const handle =
            inbound.payload?.handle ?? node.data.buttons.find((b) => b.title.trim().toLowerCase() === typed)?.id;
          if (!handle) return runFrom(ctx, node.id);
          return runFrom(ctx, nextNodeId(graph, node.id, handle));
        }
        return runFrom(ctx, node.id);
      }

      case "WAITING_ANSWER": {
        if (node.type !== "question") return runFrom(ctx, node.id);
        const value =
          node.data.answer === "photo"
            ? inbound.attachments?.length
              ? inbound.attachments.join("\n")
              : null
            : validAnswer(node.data.answer, inbound.text);
        if (value !== null) {
          await setField(ctx, node.data.field, value);
          return runFrom(ctx, nextNodeId(graph, node.id, "next"));
        }
        const retries = (ctx.vars.retries?.[node.id] ?? 0) + 1;
        ctx.vars.retries = { ...ctx.vars.retries, [node.id]: retries };
        if (retries > MAX_ANSWER_RETRIES) return runFrom(ctx, nextNodeId(graph, node.id, "next"));
        await send(ctx, node.data.retryText.trim() || `Sorry, I didn't get that. ${interpolate(ctx, node.data.text)}`);
        await save(ctx, { status: "WAITING_ANSWER", nodeId: node.id });
        return "flow_waiting";
      }

      case "WAITING_PAYMENT": {
        // They wrote while we wait for Razorpay: remind them of the link.
        const order = await paymentLink(ctx);
        if (!order) return "ignored";
        await send(ctx, `Here's your payment link again:\n\n${order.razorpayLinkUrl}\n\nOrder ${orderLabel(order)}`);
        await save(ctx, { status: "WAITING_PAYMENT", nodeId: node.id });
        return "payment_reminded";
      }

      default:
        return "ignored";
    }
  });
}

/**
 * Razorpay said the order's link was paid (or expired / was cancelled): continue the run.
 * Messages go out only if the 24 h window is still open; otherwise the next step waits for a reply.
 */
export async function continueAfterPayment(runId: string, outcome: "paid" | "expired") {
  const run = await db.flowRun.findUnique({ where: { id: runId }, include: { flow: true, contact: true } });
  if (!run || run.status !== "WAITING_PAYMENT") return "ignored";
  const { flow, contact, ...rest } = run;
  const graph = parseGraph(flow.graph);
  const node = graph.nodes.find((n) => n.id === run.nodeId);
  const client = await getClient(run.channel);
  const ctx: Ctx = {
    client,
    run: rest,
    graph,
    contact,
    vars: (run.vars ?? {}) as Vars,
    senderId: contact.dmId ?? contact.externalId,
    privateReplyTo: null,
    openingText: "",
    canSend: replyWindowOpen(contact) && !contact.optedOut,
    recheck: false,
    followGained: false,
  };
  return guarded(ctx, async () => {
    if (!node || node.type !== "payment") return runFrom(ctx, null);
    const text = outcome === "paid" ? node.data.paidText : node.data.expiredText;
    if (text.trim() && ctx.canSend) await send(ctx, interpolate(ctx, text));
    if (outcome === "expired") ctx.vars.orderId = undefined;
    return runFrom(ctx, nextNodeId(graph, node.id, outcome));
  });
}

/** The person's most recent waiting run, if any (for typed messages without a payload). */
export function findWaitingRun(contactId: string) {
  return db.flowRun.findFirst({
    where: {
      contactId,
      status: { in: WAITING },
      updatedAt: { gte: new Date(Date.now() - OPEN_RUN_DAYS * 86_400_000) },
    },
    orderBy: { updatedAt: "desc" },
  });
}

