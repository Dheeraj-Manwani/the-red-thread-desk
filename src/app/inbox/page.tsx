import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { AutoRefresh } from "@/app/inbox/auto-refresh";
import { Badge, Card, inputClass, Loading, PageTitle } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { channelLabel } from "@/lib/channels";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { displayName, inHandoff, replyWindowOpen } from "@/lib/inbox";

type SearchParams = Promise<{ view?: string; q?: string }>;

const views = {
  all: "All",
  waiting: "Waiting for you",
  unread: "Unread",
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
} as const;
type View = keyof typeof views;

async function Conversations({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const view: View = sp.view && sp.view in views ? (sp.view as View) : "all";
  const q = sp.q?.trim() ?? "";
  const now = new Date();

  const where: Prisma.ContactWhereInput = { lastMessageAt: { not: null } };
  if (view === "waiting") where.handoffAskedAt = { not: null };
  if (view === "instagram") where.channel = "INSTAGRAM";
  if (view === "facebook") where.channel = "FACEBOOK";
  if (view === "whatsapp") where.channel = "WHATSAPP";
  if (q) where.OR = [{ username: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }];

  let contacts = await db.contact.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const isUnread = (c: (typeof contacts)[number]) =>
    Boolean(c.lastInboundAt && (!c.lastReadAt || c.lastInboundAt > c.lastReadAt));
  if (view === "unread") contacts = contacts.filter(isUnread);

  return (
    <div className="space-y-4">
      <AutoRefresh />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(Object.keys(views) as View[]).map((v) => (
          <Link
            key={v}
            href={`/inbox?view=${v}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`rounded-md border px-3 py-1.5 ${
              v === view ? "border-red-700 bg-red-50 text-red-800" : "border-neutral-300 bg-white hover:bg-neutral-100"
            }`}
          >
            {views[v]}
          </Link>
        ))}
        <form className="ml-auto">
          <input type="hidden" name="view" value={view} />
          <input name="q" defaultValue={q} placeholder="Search name" className={`${inputClass} w-48`} />
        </form>
      </div>

      <Card className="divide-y divide-neutral-100 p-0">
        {contacts.length === 0 && <p className="px-4 py-6 text-sm text-neutral-500">No conversations here.</p>}
        {contacts.map((c) => {
          const last = c.messages[0];
          const unread = isUnread(c);
          return (
            <Link key={c.id} href={`/inbox/${c.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-neutral-50">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-red-600" : "bg-transparent"}`} />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={unread ? "font-semibold" : "font-medium"}>{displayName(c)}</span>
                  <Badge>{channelLabel[c.channel]}</Badge>
                  {c.handoffAskedAt && <Badge tone="red">wants you</Badge>}
                  {!c.handoffAskedAt && inHandoff(c, now) && <Badge tone="amber">bot paused</Badge>}
                  {!replyWindowOpen(c, now) && <Badge>24 h window closed</Badge>}
                  <span className="ml-auto text-xs text-neutral-400">{formatDateTime(c.lastMessageAt)}</span>
                </div>
                {last && (
                  <p className="truncate text-sm text-neutral-600">
                    {last.direction === "OUT" ? (last.source === "BOT" ? "Bot: " : "You: ") : ""}
                    {last.text}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </Card>
    </div>
  );
}

export default function InboxPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageTitle title="Inbox" />
      <Suspense fallback={<Loading />}>
        <Conversations searchParams={searchParams} />
      </Suspense>
    </>
  );
}
