import type { NextRequest } from "next/server";
import { getAccount, refreshAccountToken } from "@/lib/account";

const REFRESH_WHEN_DAYS_LEFT = 20;

/** Daily Vercel Cron (vercel.json). Instagram long-lived tokens expire after 60 days. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const account = await getAccount();
  const daysLeft = account.tokenExpiresAt
    ? (account.tokenExpiresAt.getTime() - Date.now()) / 86_400_000
    : 0;
  if (daysLeft > REFRESH_WHEN_DAYS_LEFT) return Response.json({ refreshed: false, daysLeft: Math.floor(daysLeft) });

  const updated = await refreshAccountToken();
  return Response.json({ refreshed: true, expiresAt: updated.tokenExpiresAt });
}
