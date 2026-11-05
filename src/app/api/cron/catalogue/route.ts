import type { NextRequest } from "next/server";
import { syncCatalogue } from "@/lib/catalogue";

export const maxDuration = 60;

/** Daily Vercel Cron (vercel.json): pulls designs from the Red Thread site. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!process.env.CATALOGUE_URL) return Response.json({ skipped: "CATALOGUE_URL not set" });
  return Response.json(await syncCatalogue());
}
