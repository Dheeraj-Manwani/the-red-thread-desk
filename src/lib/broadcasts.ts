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

async function start(broadcastId: string) {
  const b = await db.broadcast.findUniqueOrThrow({ where: { id: broadcastId } });
  const contacts = await db.contact.findMany({ where: audienceWhere(b.tag), select: { id: true } });
  await db.broadcastRecipient.createMany({
    data: contacts.map((c) => ({ broadcastId, contactId: c.id })),
    skipDuplicates: true,
  });
  await db.broadcast.update({ where: { id: broadcastId }, data: { status: "SENDING", startedAt: new Date() } });
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
 * Runs from the every-minute cron and right after "Send now"; safe to run twice at once
 * (a recipient that already has a message ID is never re-sent).
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
    while (Date.now() < until) {
      const batch = await db.broadcastRecipient.findMany({
        where: { broadcastId: b.id, status: "PENDING", waMessageId: null },
        take: BATCH,
        select: { id: true },
      });
      if (batch.length === 0) {
        await db.broadcast.update({ where: { id: b.id }, data: { status: "DONE", finishedAt: new Date() } });
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
