import type { Contact, Order, OrderStage, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createPaymentLink } from "@/lib/razorpay";

export const stageLabels: Record<OrderStage, string> = {
  LEAD: "Lead",
  PAYMENT_SENT: "Payment sent",
  PAID: "Paid",
  DETAILS: "Details",
  IN_PROGRESS: "In progress",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};
export const STAGES = Object.keys(stageLabels) as OrderStage[];

/** Ready-made status messages for the order page (plan: "Your invite is ready" / "Edits done"). */
export const statusMessages: Record<string, string> = {
  paid: "Payment received, thank you! 🎉 Your order {order} is confirmed. We'll ask for a few details next.",
  details: "Could you send the couple's names, the event date, venue and a Google Maps link? Photos help too.",
  ready: "Your invite is ready! 💌 Have a look: ",
  edits: "Edits done ✅ Have another look and tell us if anything else should change.",
};

export const orderLabel = (o: Pick<Order, "number">) => `RT-${1000 + o.number}`;

const fieldsOf = (c: Contact) => (c.fields ?? {}) as Record<string, string>;

function phone(raw: string | undefined) {
  const digits = raw?.replace(/[^\d]/g, "") ?? "";
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length >= 8 && digits.length <= 14) return `+${digits}`;
  return undefined;
}

/** Creates the order and its Razorpay link. Nothing is kept if Razorpay refuses. */
export async function createOrderWithLink(input: {
  contact: Contact;
  title: string;
  amountInr: number;
  packageId?: string;
  designId?: string;
  flowRunId?: string;
}) {
  const order = await db.order.create({
    data: {
      channel: input.contact.channel,
      contactId: input.contact.id,
      title: input.title,
      amountInr: input.amountInr,
      packageId: input.packageId,
      designId: input.designId,
      flowRunId: input.flowRunId,
      stage: "PAYMENT_SENT",
    },
  });
  const f = fieldsOf(input.contact);
  try {
    const link = await createPaymentLink({
      amountInr: input.amountInr,
      description: `${input.title} · Red Thread · ${orderLabel(order)}`,
      referenceId: order.id,
      customer: { name: f.couple_names || input.contact.name || undefined, email: f.email, contact: phone(f.phone) },
      notes: { order: orderLabel(order), contact: input.contact.id },
    });
    return await db.order.update({
      where: { id: order.id },
      data: { razorpayLinkId: link.id, razorpayLinkUrl: link.short_url },
    });
  } catch (error) {
    await db.order.delete({ where: { id: order.id } });
    throw error;
  }
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Best-effort: 14/02/2027, 14-2-27, 2027-02-14, 14 Feb 2027. Day first, as written in India. */
export function parseEventDate(text: string): Date | null {
  const t = text.trim().toLowerCase();
  let d: number, m: number, y: number;
  let match = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = t.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\.?,?\s+(\d{2,4})$/))) {
    [d, m, y] = [Number(match[1]), MONTHS.indexOf(match[2]) + 1, Number(match[3])];
  } else return null;
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 ? date : null;
}

/** Saves one intake answer on the order; event_date also fills Order.eventDate. */
export async function saveOrderDetail(orderId: string, field: string, value: string) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  const details = { ...((order.details ?? {}) as Record<string, string>), [field]: value };
  const data: Prisma.OrderUpdateInput = { details };
  if (field === "event_date") data.eventDate = parseEventDate(value);
  if (order.stage === "PAID") data.stage = "DETAILS";
  await db.order.update({ where: { id: orderId }, data });
}
