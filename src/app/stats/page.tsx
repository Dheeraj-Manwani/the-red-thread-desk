import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Badge, Card, Loading, PageTitle } from "@/components/ui";
import type { Channel } from "@/generated/prisma/client";
import { channelLabel } from "@/lib/channels";
import { db } from "@/lib/db";
import { daysAgo } from "@/lib/format";
import { loadRecentMedia, type MediaItem } from "@/lib/media";

const WINDOWS = [7, 30, 90] as const;
type SearchParams = Promise<{ days?: string }>;

type PostRow = {
  channel: Channel;
  mediaId: string;
  comments: number;
  matched: number;
  dms: number;
  links: number;
  follows: number;
  clicks: number;
  revenue: number;
};
type Totals = { sessions: number; links: number; follows: number; clicks: number };

/** Per post: one row per comment, joined 1:1 to its link session or flow run (flow links are pre-summed per run). */
function postStats(since: Date) {
  return db.$queryRaw<PostRow[]>`
    SELECT c.channel::text AS channel,
           c."mediaId" AS "mediaId",
           COUNT(*)::int AS comments,
           COUNT(*) FILTER (WHERE c.matched)::int AS matched,
           COUNT(c."dmSentAt")::int AS dms,
           (COUNT(s."linkSentAt") + COUNT(fl.n))::int AS links,
           COUNT(*) FILTER (WHERE s."followGained" OR r."followGained")::int AS follows,
           (COALESCE(SUM(l.clicks), 0) + COALESCE(SUM(fl.clicks), 0))::int AS clicks,
           COALESCE(SUM(ord.revenue), 0)::int AS revenue
    FROM "Comment" c
    LEFT JOIN "LinkSession" s ON s."commentId" = c.id
    LEFT JOIN "ShortLink" l ON l."sessionId" = s.id
    LEFT JOIN "FlowRun" r ON r."commentId" = c.id
    LEFT JOIN (
      SELECT "flowRunId", COUNT(*) AS n, SUM(clicks) AS clicks
      FROM "ShortLink" WHERE "flowRunId" IS NOT NULL GROUP BY "flowRunId"
    ) fl ON fl."flowRunId" = r.id
    LEFT JOIN (
      SELECT "flowRunId", SUM("amountInr") AS revenue
      FROM "Order" WHERE "paymentStatus" = 'PAID' AND "flowRunId" IS NOT NULL GROUP BY "flowRunId"
    ) ord ON ord."flowRunId" = r.id
    WHERE c."createdAt" >= ${since}
    GROUP BY c.channel, c."mediaId"
    ORDER BY MAX(c."createdAt") DESC
    LIMIT 100`;
}

async function storyStats(since: Date) {
  const [row] = await db.$queryRaw<Totals[]>`
    SELECT COUNT(*)::int AS sessions,
           COUNT(s."linkSentAt")::int AS links,
           COUNT(*) FILTER (WHERE s."followGained")::int AS follows,
           COALESCE(SUM(l.clicks), 0)::int AS clicks
    FROM "LinkSession" s
    LEFT JOIN "ShortLink" l ON l."sessionId" = s.id
    WHERE s."storyId" IS NOT NULL AND s."createdAt" >= ${since}`;
  return row;
}

async function iceBreakerStats(since: Date) {
  const [groups, items] = await Promise.all([
    db.shortLink.groupBy({
      by: ["iceBreakerId"],
      where: { iceBreakerId: { not: null }, createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { clicks: true },
    }),
    db.iceBreaker.findMany({ select: { id: true, channel: true, question: true } }),
  ]);
  return items
    .map((i) => {
      const g = groups.find((x) => x.iceBreakerId === i.id);
      return { ...i, links: g?._count._all ?? 0, clicks: g?._sum.clicks ?? 0 };
    })
    .filter((i) => i.links > 0);
}

/** Comments → DMs → links → clicks → paid, for the window. */
async function funnelStats(since: Date) {
  const [comments, dms, sessionLinks, flowLinks, clicks, paid] = await Promise.all([
    db.comment.count({ where: { createdAt: { gte: since } } }),
    db.comment.count({ where: { dmSentAt: { gte: since } } }),
    db.linkSession.count({ where: { linkSentAt: { gte: since } } }),
    db.shortLink.count({ where: { flowRunId: { not: null }, createdAt: { gte: since } } }),
    db.shortLink.count({ where: { clicks: { gt: 0 }, createdAt: { gte: since } } }),
    db.order.count({ where: { paymentStatus: "PAID", paidAt: { gte: since } } }),
  ]);
  return [
    { label: "Comments", value: comments },
    { label: "DMs sent", value: dms },
    { label: "Links sent", value: sessionLinks + flowLinks },
    { label: "Links clicked", value: clicks },
    { label: "Paid orders", value: paid },
  ];
}

async function mediaLabels(rows: PostRow[]) {
  const channels = [...new Set(rows.map((r) => r.channel))];
  const lists = await Promise.all(channels.map((c) => loadRecentMedia(c, 50)));
  const map = new Map<string, MediaItem>();
  for (const list of lists) for (const m of list.items) map.set(m.id, m);
  return map;
}

function pct(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "—";
}

async function Stats({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const { days: raw } = await searchParams;
  const days = WINDOWS.find((w) => String(w) === raw) ?? 30;
  const since = daysAgo(days);

  const [rows, stories, ice, funnel, revenueByChannel] = await Promise.all([
    postStats(since),
    storyStats(since),
    iceBreakerStats(since),
    funnelStats(since),
    db.order.groupBy({
      by: ["channel"],
      where: { paymentStatus: "PAID", paidAt: { gte: since } },
      _count: { _all: true },
      _sum: { amountInr: true },
    }),
  ]);
  const media = await mediaLabels(rows);

  return (
    <div className="space-y-6">
      <nav className="flex gap-2 text-sm">
        {WINDOWS.map((w) => (
          <Link
            key={w}
            href={`/stats?days=${w}`}
            className={`rounded-md border px-3 py-1.5 ${
              w === days ? "border-red-700 bg-red-50 text-red-800" : "border-neutral-300 bg-white hover:bg-neutral-100"
            }`}
          >
            {w} days
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="space-y-2">
          <h2 className="font-medium">Funnel</h2>
          {funnel.map((step, i) => {
            const top = funnel[0].value || 1;
            return (
              <div key={step.label} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-neutral-600">{step.label}</span>
                <div className="h-5 flex-1 rounded bg-neutral-100">
                  <div className="h-5 rounded bg-red-700" style={{ width: `${Math.max(2, (step.value / top) * 100)}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right">
                  {step.value}
                  {i > 0 && <span className="text-xs text-neutral-400"> {pct(step.value, funnel[i - 1].value)}</span>}
                </span>
              </div>
            );
          })}
          <p className="text-xs text-neutral-500">Each percentage is of the step above.</p>
        </Card>
        <Card className="space-y-1 text-sm">
          <h2 className="font-medium">Revenue by channel</h2>
          {revenueByChannel.length === 0 && <p className="text-neutral-500">No payments in this window.</p>}
          {revenueByChannel.map((r) => (
            <p key={r.channel}>
              {channelLabel[r.channel]}: ₹{(r._sum.amountInr ?? 0).toLocaleString("en-IN")} · {r._count._all} orders
            </p>
          ))}
        </Card>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Post</th>
              <th className="px-4 py-2 text-right font-medium">Comments</th>
              <th className="px-4 py-2 text-right font-medium">Matched</th>
              <th className="px-4 py-2 text-right font-medium">DMs</th>
              <th className="px-4 py-2 text-right font-medium">Links</th>
              <th className="px-4 py-2 text-right font-medium">Follows gained</th>
              <th className="px-4 py-2 text-right font-medium">Clicks</th>
              <th className="px-4 py-2 text-right font-medium">Revenue (₹)</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-neutral-500">
                  No comments in the last {days} days.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const m = media.get(r.mediaId);
              return (
                <tr key={`${r.channel}:${r.mediaId}`} className="border-b border-neutral-100 align-top last:border-0">
                  <td className="px-4 py-2">
                    <div className="flex items-start gap-3">
                      {m?.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.thumbnail} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                      )}
                      <div className="space-y-1">
                        <Badge>{channelLabel[r.channel]}</Badge>
                        <p className="max-w-xs truncate">
                          {m?.permalink ? (
                            <a href={m.permalink} target="_blank" rel="noreferrer" className="hover:underline">
                              {m.caption?.slice(0, 60) || `${m.label} · ${m.date}`}
                            </a>
                          ) : (
                            <span className="text-neutral-500">{r.mediaId}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">{r.comments}</td>
                  <td className="px-4 py-2 text-right">{r.matched}</td>
                  <td className="px-4 py-2 text-right">{r.dms}</td>
                  <td className="px-4 py-2 text-right">{r.links}</td>
                  <td className="px-4 py-2 text-right">{r.channel === "INSTAGRAM" ? r.follows : "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {r.clicks} <span className="text-xs text-neutral-400">{pct(r.clicks, r.links)}</span>
                  </td>
                  <td className="px-4 py-2 text-right">{r.revenue ? r.revenue.toLocaleString("en-IN") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="space-y-1 text-sm">
          <h2 className="font-medium">Instagram story replies</h2>
          <p>
            {stories.sessions} replies matched · {stories.links} links sent · {stories.follows} follows gained ·{" "}
            {stories.clicks} clicks
          </p>
        </Card>
        <Card className="space-y-1 text-sm">
          <h2 className="font-medium">Ice breakers</h2>
          {ice.length === 0 && <p className="text-neutral-500">No ice breaker links sent.</p>}
          {ice.map((i) => (
            <p key={i.id}>
              {channelLabel[i.channel]} · {i.question}: {i.links} links · {i.clicks} clicks
            </p>
          ))}
        </Card>
      </div>
      <p className="text-xs text-neutral-500">
        Follows gained: people who weren&apos;t following at the first check and were when the link went out. Clicks exclude
        link-preview crawlers.
      </p>
    </div>
  );
}

export default function StatsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageTitle title="Per-post stats" />
      <Suspense fallback={<Loading />}>
        <Stats searchParams={searchParams} />
      </Suspense>
    </>
  );
}
