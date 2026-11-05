import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => v || undefined);

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  INSTAGRAM_APP_SECRET: z.string().min(1),
  INSTAGRAM_VERIFY_TOKEN: z.string().min(1),
  INSTAGRAM_ACCESS_TOKEN: optional,
  /** Meta app secret (App settings > Basic). Signs Page and Messenger webhooks. */
  FACEBOOK_APP_SECRET: optional,
  /** Defaults to INSTAGRAM_VERIFY_TOKEN. */
  FACEBOOK_VERIFY_TOKEN: optional,
  /** Page token made from a long-lived user token (does not expire). */
  FACEBOOK_PAGE_ACCESS_TOKEN: optional,
  GRAPH_API_VERSION: z.string().default("v26.0"),
  /** WhatsApp Cloud API (phase 6). Phone number ID of your number, after Coexistence onboarding. */
  WHATSAPP_PHONE_NUMBER_ID: optional,
  /** WhatsApp Business Account ID (templates live there). */
  WHATSAPP_BUSINESS_ACCOUNT_ID: optional,
  /** System user token with whatsapp_business_messaging + whatsapp_business_management. */
  WHATSAPP_ACCESS_TOKEN: optional,
  /** Defaults to INSTAGRAM_VERIFY_TOKEN. Webhooks are signed with FACEBOOK_APP_SECRET (same Meta app). */
  WHATSAPP_VERIFY_TOKEN: optional,
  /** ₹ per template message before GST, for cost previews. Check Meta's rate card for India. */
  WA_RATE_MARKETING_INR: z.coerce.number().default(0.86),
  WA_RATE_UTILITY_INR: z.coerce.number().default(0.115),
  WA_RATE_AUTHENTICATION_INR: z.coerce.number().default(0.115),
  /** AI intent (phase 6). Off unless ANTHROPIC_API_KEY is set. */
  ANTHROPIC_API_KEY: optional,
  AI_MODEL: z.string().default("claude-opus-5-5"),
  /** Hard monthly cap in US$; AI calls stop for the month once reached. */
  AI_MONTHLY_CAP_USD: z.coerce.number().default(5),
  /** Web push. Generate with web-push's generateVAPIDKeys(). */
  VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  /** https: URL or mailto: address push services can contact. Defaults to APP_URL when it's https. */
  VAPID_SUBJECT: optional,
  /** Razorpay (phase 5). Test keys start rzp_test_. */
  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  /** Set when you add the webhook in the Razorpay dashboard. */
  RAZORPAY_WEBHOOK_SECRET: optional,
  /** JSON feed of designs on the Red Thread site (see src/lib/catalogue.ts for the shapes accepted). */
  CATALOGUE_URL: optional,
  /** Sent as "Authorization: Bearer <token>" if the feed needs it. */
  CATALOGUE_TOKEN: optional,
  ADMIN_USER: z.string().default("admin"),
  ADMIN_PASSWORD: optional,
  CRON_SECRET: optional,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Read env lazily so `next build` works without secrets. */
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid environment variables: ${missing}`);
    }
    cached = parsed.data;
  }
  return cached;
}
