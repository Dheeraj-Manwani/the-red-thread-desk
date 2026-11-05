import type { Contact, Prisma, TemplateCategory, WaTemplate } from "@/generated/prisma/client";
import { getAccount } from "@/lib/account";
import { db, isUniqueViolation } from "@/lib/db";
import { env } from "@/lib/env";
import { errorText } from "@/lib/graph";
import { recordMessage } from "@/lib/inbox";
import { whatsapp, type TemplateComponent } from "@/lib/whatsapp";

export const GST = 0.18;
const BATCH = 50;
const PARALLEL = 5;

/** ₹ per message before GST, from .env (Meta's India rate card changes; keep these current). */
export function rateFor(category: TemplateCategory) {
  const e = env();
  return category === "MARKETING"
    ? e.WA_RATE_MARKETING_INR
    : category === "UTILITY"
      ? e.WA_RATE_UTILITY_INR
      : e.WA_RATE_AUTHENTICATION_INR;
}

/** Upper bound: utility templates inside an open 24 h window are actually free. */
export function estimateCost(count: number, category: TemplateCategory) {
  return Math.round(count * rateFor(category) * (1 + GST) * 100) / 100;
}

/** Who a broadcast may go to: WhatsApp contacts who opted in and haven't sent STOP. */
export function audienceWhere(tag: string | null | undefined): Prisma.ContactWhereInput {
  return {
    channel: "WHATSAPP",
    optedOut: false,
    marketingOptInAt: { not: null },
    ...(tag ? { tags: { some: { tag: { name: tag } } } } : {}),
  };
}

export type VariableSource = { kind: "name" } | { kind: "field"; field: string } | { kind: "text"; value: string };

export function bodyText(components: unknown) {
  return ((components as TemplateComponent[]) ?? []).find((c) => c.type === "BODY")?.text ?? "";
}

/** Number of {{n}} placeholders in the body. */
export function variableCount(components: unknown) {
  const nums = [...bodyText(components).matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

function resolve(sources: VariableSource[], count: number, contact: Contact) {
  const fields = (contact.fields ?? {}) as Record<string, string>;
  return Array.from({ length: count }, (_, i) => {
    const s = sources[i];
    const value =
      s?.kind === "name"
        ? (contact.name ?? contact.username ?? "").split(" ")[0]
        : s?.kind === "field"
          ? fields[s.field]
          : s?.kind === "text"
            ? s.value
            : "";
    // Meta rejects empty parameters.
    return (value ?? "").trim() || (s?.kind === "name" ? "there" : "-");
  });
}

const render = (text: string, params: string[]) => text.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");

/** Pulls templates and their approval status from the WhatsApp Business Account. */
export async function syncTemplates() {
  const waba = env().WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!waba) throw new Error("Set WHATSAPP_BUSINESS_ACCOUNT_ID.");
  const account = await getAccount("WHATSAPP");
  const { data } = await whatsapp.listTemplates(account.accessToken, waba);
  for (const t of data) {
    const category = (["MARKETING", "UTILITY", "AUTHENTICATION"].includes(t.category) ? t.category : "MARKETING") as TemplateCategory;
    const values = {
      category,
      status: t.status,
      components: t.components as unknown as Prisma.InputJsonValue,
      metaId: t.id,
      reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
    };
    await db.waTemplate.upsert({
      where: { name_language: { name: t.name, language: t.language } },
      create: { name: t.name, language: t.language, ...values },
      update: values,
    });
  }
  return data.length;
}

/** Submits a new template to Meta for approval and stores it as PENDING. */
export async function submitTemplate(t: {
  name: string;
  language: string;
  category: TemplateCategory;
  body: string;
  examples: string[];
  footer?: string;
  quickReplies: string[];
}) {
  const waba = env().WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!waba) throw new Error("Set WHATSAPP_BUSINESS_ACCOUNT_ID.");
  const account = await getAccount("WHATSAPP");
  const components: TemplateComponent[] = [
    { type: "BODY", text: t.body, ...(t.examples.length ? { example: { body_text: [t.examples] } } : {}) },
    ...(t.footer ? [{ type: "FOOTER" as const, text: t.footer }] : []),
    ...(t.quickReplies.length
      ? [{ type: "BUTTONS" as const, buttons: t.quickReplies.map((text) => ({ type: "QUICK_REPLY", text })) }]
      : []),
  ];
  const res = await whatsapp.createTemplate(account.accessToken, waba, {
    name: t.name,
    language: t.language,
    category: t.category,
    components,
  });
  return db.waTemplate.upsert({
    where: { name_language: { name: t.name, language: t.language } },
    create: {
      name: t.name,
      language: t.language,
      category: t.category,
      status: res.status ?? "PENDING",
      components: components as unknown as Prisma.InputJsonValue,
      metaId: res.id,
    },
    update: { status: res.status ?? "PENDING", components: components as unknown as Prisma.InputJsonValue, metaId: res.id },
  });
}

/**
 * Builds the recipient list, then flips SCHEDULED → SENDING. Recipients are written first, so no sender
 * ever sees a SENDING broadcast with a half-built list; the conditional update means only one run starts it.
 */
async function start(broadcastId: string) {
  const b = await db.broadcast.findUniqueOrThrow({ where: { id: broadcastId } });
  if (b.status !== "SCHEDULED") return;
  const contacts = await db.contact.findMany({ where: audienceWhere(b.tag), select: { id: true } });
  await db.broadcastRecipient.createMany({
    data: contacts.map((c) => ({ broadcastId, contactId: c.id })),
    skipDuplicates: true,
  });
  await db.broadcast.updateMany({
    where: { id: broadcastId, status: "SCHEDULED" },
    data: { status: "SENDING", startedAt: new Date() },
  });
}

/** A claim older than this means its run died mid-send. */
const STALE_CLAIM_MS = 10 * 60_000;

/**
 * Atomically takes up to `limit` PENDING recipients for this run by marking them SENDING.
 * SKIP LOCKED makes a second, overlapping run take different rows (or none), never the same ones.
 */
function claim(broadcastId: string, limit: number) {
  return db.$queryRaw<{ id: string }[]>`
    UPDATE "BroadcastRecipient"
    SET status = 'SENDING'::"RecipientStatus", "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM "BroadcastRecipient"
      WHERE "broadcastId" = ${broadcastId} AND status = 'PENDING'::"RecipientStatus"
      ORDER BY id
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
}

/**
 * Claims whose run died (crash, timeout) are failed, not retried: the template may already have been
 * delivered before the run died, and sending it again would charge and annoy twice.
 */
function failStaleClaims(broadcastId: string) {
  return db.broadcastRecipient.updateMany({
    where: {
      broadcastId,
      status: "SENDING",
      waMessageId: null,
      updatedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) },
    },
    data: { status: "FAILED", error: "send interrupted; not retried to avoid a duplicate" },
  });
}

async function sendOne(
  recipientId: string,
  template: WaTemplate,
  sources: VariableSource[],
  token: string,
  phoneId: string,
) {
  const r = await db.broadcastRecipient.findUniqueOrThrow({ where: { id: recipientId } });
  const contact = await db.contact.findUnique({ where: { id: r.contactId } });
  // Consent can change between planning and sending.
  if (!contact || contact.optedOut || !contact.marketingOptInAt) {
    await db.broadcastRecipient.update({ where: { id: r.id }, data: { status: "FAILED", error: "no longer opted in" } });
    return;
  }
  const params = resolve(sources, variableCount(template.components), contact);
  try {
    const res = await whatsapp.sendTemplate(token, phoneId, contact.externalId, template.name, template.language, params);
    const mid = res.messages?.[0]?.id;
    await db.broadcastRecipient.update({
      where: { id: r.id },
      data: { status: "SENT", waMessageId: mid, sentAt: new Date() },
    });
    await recordMessage({
      channel: "WHATSAPP",
      contactId: contact.id,
      direction: "OUT",
      source: "BOT",
      text: `[${template.name}] ${render(bodyText(template.components), params)}`,
      mid,
    }).catch(() => {});
  } catch (error) {
    if (isUniqueViolation(error)) return;
    await db.broadcastRecipient.update({
      where: { id: r.id },
      data: { status: "FAILED", error: errorText(error).slice(0, 300) },
    });
  }
}

/**
 * Starts due broadcasts and sends pending recipients until the time budget runs out.
 * Runs from the every-minute cron and right after "Send now". Overlapping runs are safe:
 * each recipient is claimed by exactly one run before anything is sent to it.
 */
export async function processBroadcasts(budgetMs = 45_000) {
  const until = Date.now() + budgetMs;
  const due = await db.broadcast.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } } });
  for (const b of due) await start(b.id);

  const sending = await db.broadcast.findMany({ where: { status: "SENDING" }, include: { template: true } });
  if (sending.length === 0) return { sent: 0 };
  const account = await getAccount("WHATSAPP");
  let sent = 0;
  for (const b of sending) {
    const sources = (b.variables ?? []) as VariableSource[];
    await failStaleClaims(b.id);
    while (Date.now() < until) {
      // Stopped from the page while we were sending: leave the rest PENDING.
      const current = await db.broadcast.findUnique({ where: { id: b.id }, select: { status: true } });
      if (current?.status !== "SENDING") break;

      const batch = await claim(b.id, BATCH);
      if (batch.length === 0) {
        // Done only when no other run still has claims in flight.
        const inFlight = await db.broadcastRecipient.count({ where: { broadcastId: b.id, status: "SENDING" } });
        if (inFlight === 0) {
          await db.broadcast.updateMany({
            where: { id: b.id, status: "SENDING" },
            data: { status: "DONE", finishedAt: new Date() },
          });
        }
        break;
      }
      for (let i = 0; i < batch.length; i += PARALLEL) {
        await Promise.all(
          batch.slice(i, i + PARALLEL).map((r) => sendOne(r.id, b.template, sources, account.accessToken, account.externalId)),
        );
      }
      sent += batch.length;
    }
  }
  return { sent };
}

/** Estimated spend this month on template messages, from broadcast recipients actually sent. */
export async function waSpendThisMonth() {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const rows = await db.broadcastRecipient.findMany({
    where: { sentAt: { gte: start }, status: { in: ["SENT", "DELIVERED", "READ"] } },
    select: { broadcast: { select: { template: { select: { category: true } } } } },
  });
  return rows.reduce((sum, r) => sum + rateFor(r.broadcast.template.category) * (1 + GST), 0);
}
