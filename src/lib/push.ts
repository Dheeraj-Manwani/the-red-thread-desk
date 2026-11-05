import webpush from "web-push";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export type PushPayload = { title: string; body: string; url: string; tag?: string };

let configured = false;

function subject() {
  const e = env();
  if (e.VAPID_SUBJECT) return e.VAPID_SUBJECT;
  return e.APP_URL.startsWith("https://") ? e.APP_URL : null;
}

/** False when VAPID keys or a usable subject are missing: push is then skipped. */
function configure() {
  const e = env();
  const s = subject();
  if (!e.VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY || !s) return false;
  if (!configured) {
    webpush.setVapidDetails(s, e.VAPID_PUBLIC_KEY, e.VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

export function pushStatus() {
  const e = env();
  if (!e.VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY) return "Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env.";
  if (!subject()) return "Set VAPID_SUBJECT (https: URL or mailto:), or use an https APP_URL.";
  return null;
}

/** Sends to every saved subscription. Subscriptions the push service says are gone get deleted. */
export async function sendPush(payload: PushPayload) {
  if (!configure()) return { sent: 0, failed: 0 };
  const subs = await db.pushSubscription.findMany();
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 3600, urgency: "high" },
        );
        sent++;
      } catch (error) {
        failed++;
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        } else {
          console.warn("[push] send failed", status, error instanceof Error ? error.message : error);
        }
      }
    }),
  );
  return { sent, failed };
}
