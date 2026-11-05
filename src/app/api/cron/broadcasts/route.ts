import type { NextRequest } from "next/server";
import { processBroadcasts } from "@/lib/broadcasts";

export const maxDuration = 60;

/** Every-minute Vercel Cron (vercel.json): starts scheduled broadcasts and sends the next batch. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!process.env.WHATSAPP_ACCESS_TOKEN) return Response.json({ skipped: "WhatsApp not configured" });
  return Response.json(await processBroadcasts());
}
