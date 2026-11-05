import { connection } from "next/server";
import { db } from "@/lib/db";

/** Conversations with a DM newer than the last time you opened them. */
export function unreadCount() {
  return db.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM "Contact"
    WHERE "lastInboundAt" IS NOT NULL AND ("lastReadAt" IS NULL OR "lastInboundAt" > "lastReadAt")`.then((r) => r[0]?.n ?? 0);
}

export async function UnreadBadge() {
  await connection();
  const n = await unreadCount();
  if (!n) return null;
  return <span className="ml-1 rounded-full bg-red-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">{n}</span>;
}
