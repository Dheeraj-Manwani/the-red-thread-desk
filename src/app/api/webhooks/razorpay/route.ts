import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { validRazorpaySignature, type RazorpayWebhook } from "@/lib/razorpay";
import { saveAndProcess } from "@/lib/webhooks";

export const maxDuration = 60;

/** Razorpay webhook: payment_link.paid / expired / cancelled. Signed with RAZORPAY_WEBHOOK_SECRET. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!validRazorpaySignature(raw, request.headers.get("x-razorpay-signature"))) {
    return new Response("Invalid signature", { status: 401 });
  }
  let body: RazorpayWebhook;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (!body.event?.startsWith("payment_link.")) return new Response("OK");

  // Razorpay retries with the same event ID; fall back to a hash of the body.
  const eventId = request.headers.get("x-razorpay-event-id") ?? createHash("sha256").update(raw).digest("hex");
  await saveAndProcess("razorpay", [{ dedupeKey: `rzp:${eventId}`, stored: { kind: "razorpay", event: body } }]);
  return new Response("OK");
}
