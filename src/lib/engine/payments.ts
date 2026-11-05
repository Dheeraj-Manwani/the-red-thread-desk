import { getClient } from "@/lib/channels";
import { db } from "@/lib/db";
import { continueAfterPayment } from "@/lib/flows/engine";
import { displayName, notifyAbout, replyWindowOpen } from "@/lib/inbox";
import { orderLabel, statusMessages } from "@/lib/orders";
import type { RazorpayWebhook } from "@/lib/razorpay";

const rupees = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** payment_link.paid / .expired / .cancelled → order status, a push to you, and the flow (or a thank-you). */
export async function handleRazorpayEvent(body: RazorpayWebhook) {
  const link = body.payload?.payment_link?.entity;
  if (!link?.id) return "ignored";
  const order =
    (await db.order.findUnique({ where: { razorpayLinkId: link.id }, include: { contact: true } })) ??
    (link.reference_id
      ? await db.order.findUnique({ where: { id: link.reference_id }, include: { contact: true } })
      : null);
  if (!order) return "unknown_order";

  if (body.event === "payment_link.paid") {
    if (order.paymentStatus === "PAID") return "duplicate";
    const updated = await db.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: "PAID",
        paidAt: new Date(),
        razorpayPaymentId: body.payload?.payment?.entity?.id,
        ...(order.stage === "LEAD" || order.stage === "PAYMENT_SENT" ? { stage: "PAID" as const } : {}),
      },
    });
    await notifyAbout(
      order.contact,
      `Paid ₹${rupees.format(order.amountInr)}: ${orderLabel(order)}`,
      `${displayName(order.contact)} · ${order.title}`,
      { urgent: true },
    );
    if (order.flowRunId) return continueAfterPayment(order.flowRunId, "paid");

    // Link sent by hand from the inbox: thank them if Meta still lets us.
    if (replyWindowOpen(order.contact) && !order.contact.optedOut) {
      const client = await getClient(order.channel);
      await client.sendMessage(
        order.contact.dmId ?? order.contact.externalId,
        statusMessages.paid.replace("{order}", orderLabel(updated)),
      );
    }
    return "paid";
  }

  if (body.event === "payment_link.expired" || body.event === "payment_link.cancelled") {
    if (order.paymentStatus === "PAID") return "ignored";
    await db.order.update({
      where: { id: order.id },
      data: { paymentStatus: body.event === "payment_link.expired" ? "EXPIRED" : "CANCELLED" },
    });
    if (order.flowRunId) return continueAfterPayment(order.flowRunId, "expired");
    return "link_closed";
  }
  return "ignored";
}
