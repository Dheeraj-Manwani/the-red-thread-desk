import type { RecipientStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { WaStatus, WaTemplateUpdate } from "@/lib/engine/types";

const RANK: Record<RecipientStatus, number> = { PENDING: 0, SENDING: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };
const FROM_META: Record<string, RecipientStatus> = { sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED" };

/** Delivery receipts. Only broadcast recipients are tracked; statuses arrive out of order, so never step back. */
export async function handleWaStatus(s: WaStatus) {
  const next = FROM_META[s.status];
  if (!next) return "ignored";
  const recipient = await db.broadcastRecipient.findUnique({ where: { waMessageId: s.id } });
  if (!recipient) return "ignored";
  if (RANK[next] <= RANK[recipient.status] && next !== "FAILED") return "ignored";
  const error = s.errors?.[0];
  await db.broadcastRecipient.update({
    where: { id: recipient.id },
    data: {
      status: next,
      ...(error ? { error: `${error.code}: ${error.message ?? error.title ?? "failed"}`.slice(0, 300) } : {}),
    },
  });
  return `status_${s.status}`;
}

/** Meta approved, rejected or paused a template. */
export async function handleTemplateUpdate(u: WaTemplateUpdate) {
  const result = await db.waTemplate.updateMany({
    where: { name: u.message_template_name, ...(u.message_template_language ? { language: u.message_template_language } : {}) },
    data: { status: u.event.toUpperCase(), reason: u.reason && u.reason !== "NONE" ? u.reason : null },
  });
  return result.count ? "template_updated" : "unknown_template";
}
