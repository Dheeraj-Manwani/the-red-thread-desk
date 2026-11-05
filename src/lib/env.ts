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
