import type { NextRequest } from "next/server";
import { getAccount, refreshInstagramToken } from "@/lib/account";

const REFRESH_WHEN_DAYS_LEFT = 20;

/** Daily Vercel Cron (vercel.json). Instagram long-lived tokens expire after 60 days; Page tokens don't. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const account = await getAccount("INSTAGRAM");
  const daysLeft = account.tokenExpiresAt ? (account.tokenExpiresAt.getTime() - Date.now()) / 86_400_000 : 0;
  if (daysLeft > REFRESH_WHEN_DAYS_LEFT) return Response.json({ refreshed: false, daysLeft: Math.floor(daysLeft) });

  const updated = await refreshInstagramToken();
  return Response.json({ refreshed: true, expiresAt: updated.tokenExpiresAt });
}
