import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** Razorpay Payment Links. Docs: razorpay.com/docs/api/payments/payment-links */
const BASE = "https://api.razorpay.com/v1";

export class RazorpayError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "RazorpayError";
  }
}

export function razorpayConfigured() {
  const e = env();
  return Boolean(e.RAZORPAY_KEY_ID && e.RAZORPAY_KEY_SECRET);
}

export type PaymentLink = {
  id: string;
  short_url: string;
  status: "created" | "partially_paid" | "expired" | "cancelled" | "paid";
  amount: number;
  amount_paid?: number;
  reference_id?: string;
};

export async function createPaymentLink(input: {
  amountInr: number;
  description: string;
  referenceId: string;
  customer?: { name?: string; email?: string; contact?: string };
  expiresInDays?: number;
  notes?: Record<string, string>;
}): Promise<PaymentLink> {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = env();
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) throw new Error("Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  if (!Number.isInteger(input.amountInr) || input.amountInr < 1) throw new Error("Amount must be at least ₹1.");

  const customer = Object.fromEntries(Object.entries(input.customer ?? {}).filter(([, v]) => v));
  const body = {
    amount: input.amountInr * 100, // paise
    currency: "INR",
    description: input.description.slice(0, 2048),
    reference_id: input.referenceId.slice(0, 40),
    ...(Object.keys(customer).length ? { customer } : {}),
    // We send the link in the DM ourselves.
    notify: { sms: false, email: false },
    reminder_enable: false,
    expire_by: Math.floor(Date.now() / 1000) + (input.expiresInDays ?? 7) * 86_400,
    notes: input.notes,
  };
  const res = await fetch(`${BASE}/payment_links`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as PaymentLink & { error?: { description?: string } };
  if (!res.ok || !json.id) throw new RazorpayError(json.error?.description ?? `Razorpay ${res.status}`, res.status);
  return json;
}

/** X-Razorpay-Signature = hex HMAC-SHA256 of the raw body with the webhook secret. */
export function validRazorpaySignature(raw: string, header: string | null) {
  const secret = env().RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !header || !/^[0-9a-f]{64}$/.test(header)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  return timingSafeEqual(Buffer.from(header, "hex"), Buffer.from(expected, "hex"));
}

/** The parts of a payment_link.* webhook we use. */
export type RazorpayWebhook = {
  event: string;
  payload?: {
    payment_link?: { entity?: { id: string; status?: string; reference_id?: string; amount_paid?: number } };
    payment?: { entity?: { id: string; amount?: number; status?: string } };
  };
};
