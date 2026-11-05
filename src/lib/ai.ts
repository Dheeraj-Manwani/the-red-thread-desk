import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/** Intents the inbox can act on. Automations pick which ones they answer. */
export const INTENTS = ["price", "designs", "order_status", "human", "greeting", "other"] as const;
export type Intent = (typeof INTENTS)[number];

export const intentLabels: Record<Intent, string> = {
  price: "Asks about price / packages",
  designs: "Wants to see designs",
  order_status: "Asks about their order",
  human: "Wants to talk to a person",
  greeting: "Just says hi",
  other: "Anything else",
};

/** US$ per million tokens [input, output]. Unknown models are priced high so the cap errs on the safe side. */
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};
const UNKNOWN_PRICE: [number, number] = [10, 50];

const Result = z.object({
  intent: z.enum(INTENTS),
  language: z.enum(["english", "hindi", "hinglish", "other"]),
});

const SYSTEM = `You sort Instagram, Facebook and WhatsApp DMs sent to Red Thread, an Indian business selling digital wedding and event invitations (packages from ₹299 to ₹5,999).
Messages are in English, Hindi (Devanagari) or Hinglish (Hindi in Latin letters), often short, with typos and emoji.
Pick one intent:
- price: asks what something costs or about packages ("kitne ka hai", "price?", "rate batao", "charges kya hai")
- designs: wants to see designs, samples, templates or a catalogue ("designs dikhao", "sample bhejo", "wedding card options")
- order_status: already ordered or paid and asks about progress, delivery or changes ("mera invite kab milega", "order status", "edit karna hai")
- human: wants a person, a call, or is upset ("call me", "kisi se baat karni hai", "reply nahi aa raha")
- greeting: only a greeting or thanks ("hi", "hello ji", "namaste", "thank you")
- other: anything else
Also report the message's language.`;

const monthKey = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(new Date());

export function aiConfigured() {
  return Boolean(env().ANTHROPIC_API_KEY);
}

export async function aiSpendThisMonth() {
  const r = await db.aiUsage.aggregate({ _sum: { costUsd: true }, _count: true, where: { month: monthKey() } });
  return { costUsd: r._sum.costUsd ?? 0, calls: r._count };
}

let client: Anthropic | undefined;

/**
 * Classifies one DM. Returns null when AI is off, the month's cap is reached, the text is too short,
 * or the model declined. Never throws for API errors: the message then just goes to the inbox.
 */
export async function classifyIntent(text: string): Promise<{ intent: Intent; language: string } | null> {
  const e = env();
  const message = text.trim();
  if (!e.ANTHROPIC_API_KEY || message.length < 2) return null;
  const { costUsd } = await aiSpendThisMonth();
  if (costUsd >= e.AI_MONTHLY_CAP_USD) return null;

  client ??= new Anthropic({ apiKey: e.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 20_000 });
  try {
    const response = await client.beta.messages.parse({
      model: e.AI_MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: "user", content: message.slice(0, 1000) }],
      // Classification: low effort keeps thinking (and cost) small.
      output_config: { effort: "low", format: betaZodOutputFormat(Result) },
      // If the model declines, the API retries on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    const models = [e.AI_MODEL, ...(response.usage.iterations ?? []).flatMap((i) => ("model" in i && i.model ? [i.model] : []))];
    const [inPrice, outPrice] = models
      .map((m) => PRICES[m] ?? UNKNOWN_PRICE)
      .reduce((max, p) => (p[0] > max[0] ? p : max), [0, 0]);
    const inputTokens =
      response.usage.input_tokens + (response.usage.cache_creation_input_tokens ?? 0) + (response.usage.cache_read_input_tokens ?? 0);
    const outputTokens = response.usage.output_tokens;
    await db.aiUsage.create({
      data: {
        month: monthKey(),
        purpose: "intent",
        model: response.model,
        inputTokens,
        outputTokens,
        costUsd: (inputTokens * inPrice + outputTokens * outPrice) / 1_000_000,
      },
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) return null;
    return response.parsed_output;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) console.warn("[ai] rate limited");
    else if (error instanceof Anthropic.APIError) console.warn("[ai] API error", error.status, error.message);
    else console.warn("[ai] intent failed", error);
    return null;
  }
}
