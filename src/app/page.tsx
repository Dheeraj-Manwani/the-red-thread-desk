import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Badge, Card, Loading, PageTitle } from "@/components/ui";
import { help } from "@/content/help";
import { aiConfigured, aiSpendThisMonth } from "@/lib/ai";
import { waSpendThisMonth } from "@/lib/broadcasts";
import { channelLabel } from "@/lib/channels";
import { db } from "@/lib/db";
import { daysAgo, formatDateTime } from "@/lib/format";
import { displayName, REPLY_WINDOW_HOURS } from "@/lib/inbox";

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function startOfTodayIst() {
  const ist = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return new Date(`${ist}T00:00:00+05:30`);
}

function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const inner = (
    <Card className="h-full">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

async function Dashboard() {
  await connection();
  const today = startOfTodayIst();
  const week = daysAgo(7);
  // Windows that close within the next 4 hours: last DM 20–24 h ago.
  const closingFrom = daysAgo(REPLY_WINDOW_HOURS / 24);
  const closingTo = daysAgo((REPLY_WINDOW_HOURS - 4) / 24);

  const [comments, dmsIn, newLeads, paidToday, paidWeek, handoffs, closing, topPosts, failed, waSpend, ai] =
    await Promise.all([
      db.comment.count({ where: { createdAt: { gte: today } } }),
      db.message.count({ where: { direction: "IN", createdAt: { gte: today } } }),
      db.contact.count({ where: { createdAt: { gte: today } } }),
      db.order.aggregate({ _count: true, _sum: { amountInr: true }, where: { paymentStatus: "PAID", paidAt: { gte: today } } }),
      db.order.aggregate({ _count: true, _sum: { amountInr: true }, where: { paymentStatus: "PAID", paidAt: { gte: week } } }),
      db.contact.findMany({ where: { handoffAskedAt: { not: null } }, orderBy: { handoffAskedAt: "asc" }, take: 8 }),
      db.contact.findMany({
        where: { lastInboundAt: { gte: closingFrom, lt: closingTo }, optedOut: false },
        orderBy: { lastInboundAt: "asc" },
        take: 8,
      }),
      db.comment.groupBy({
        by: ["channel", "mediaId"],
        where: { createdAt: { gte: week } },
        _count: { _all: true },
        orderBy: { _count: { mediaId: "desc" } },
        take: 3,
      }),
      db.webhookEvent.count({ where: { status: "FAILED", receivedAt: { gte: week } } }),
      waSpendThisMonth(),
      aiConfigured() ? aiSpendThisMonth() : Promise.resolve(null),
    ]);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-500">Today</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Stat label="Comments" value={comments} href="/comments" />
          <Stat label="DMs received" value={dmsIn} href="/inbox" />
          <Stat label="New leads" value={newLeads} href="/contacts" />
          <Stat label="Payments" value={paidToday._count} href="/orders" />
          <Stat label="Revenue" value={rupees(paidToday._sum.amountInr ?? 0)} href="/orders" />
        </div>
        <p className="text-sm text-neutral-600">
          Last 7 days: {paidWeek._count} payments, {rupees(paidWeek._sum.amountInr ?? 0)}.{" "}
          <Link className="underline" href="/stats">
            Analytics
          </Link>
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-2">
          <h2 className="font-medium">Waiting for you</h2>
          {handoffs.length === 0 && <p className="text-sm text-neutral-500">Nobody has asked for you.</p>}
          {handoffs.map((c) => (
            <Link key={c.id} href={`/inbox/${c.id}`} className="flex items-center gap-2 text-sm hover:underline">
              <Badge tone="red">{channelLabel[c.channel]}</Badge>
              {displayName(c)}
              <span className="ml-auto text-xs text-neutral-500">since {formatDateTime(c.handoffAskedAt)}</span>
            </Link>
          ))}
        </Card>

        <Card className="space-y-2">
          <h2 className="font-medium">24 h windows closing soon</h2>
          {closing.length === 0 && <p className="text-sm text-neutral-500">None in the next 4 hours.</p>}
          {closing.map((c) => (
            <Link key={c.id} href={`/inbox/${c.id}`} className="flex items-center gap-2 text-sm hover:underline">
              <Badge tone="amber">{channelLabel[c.channel]}</Badge>
              {displayName(c)}
              <span className="ml-auto text-xs text-neutral-500">last message {formatDateTime(c.lastInboundAt)}</span>
            </Link>
          ))}
        </Card>

        <Card className="space-y-2">
          <h2 className="font-medium">Top posts this week</h2>
          {topPosts.length === 0 && <p className="text-sm text-neutral-500">No comments this week.</p>}
          {topPosts.map((p) => (
            <p key={`${p.channel}:${p.mediaId}`} className="text-sm">
              <Badge>{channelLabel[p.channel]}</Badge> {p.mediaId} · {p._count._all} comments
            </p>
          ))}
          <Link className="text-sm underline" href="/stats">
            Per-post stats
          </Link>
        </Card>

        <Card className="space-y-1 text-sm">
          <h2 className="font-medium">Spend this month</h2>
          <p>WhatsApp templates: about {rupees(waSpend)} incl. GST (estimate from broadcasts sent)</p>
          <p>
            AI intent:{" "}
            {ai ? `$${ai.costUsd.toFixed(2)} over ${ai.calls} messages` : "off (set ANTHROPIC_API_KEY to turn it on)"}
          </p>
          {failed > 0 && (
            <p className="text-red-700">
              {failed} webhook events failed this week. See the{" "}
              <Link className="underline" href="/comments">
                comment log
              </Link>
              .
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <>
      <PageTitle title="Dashboard" help={help.dashboard} />
      <Suspense fallback={<Loading />}>
        <Dashboard />
      </Suspense>
    </>
  );
}
