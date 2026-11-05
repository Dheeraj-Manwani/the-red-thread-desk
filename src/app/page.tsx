import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Card, Loading, PageTitle } from "@/components/ui";
import { db } from "@/lib/db";
import { daysAgo } from "@/lib/format";

async function Stats() {
  await connection();
  const since = daysAgo(7);
  const [comments, matched, dms, sessionLinks, flowLinks, clicks, sessionFollows, flowFollows, failed] =
    await Promise.all([
    db.comment.count({ where: { createdAt: { gte: since } } }),
    db.comment.count({ where: { createdAt: { gte: since }, matched: true } }),
    db.comment.count({ where: { dmSentAt: { gte: since } } }),
    db.linkSession.count({ where: { linkSentAt: { gte: since } } }),
    db.shortLink.count({ where: { flowRunId: { not: null }, createdAt: { gte: since } } }),
    db.shortLink.aggregate({ _sum: { clicks: true }, where: { createdAt: { gte: since } } }),
    db.linkSession.count({ where: { followGained: true, linkSentAt: { gte: since } } }),
    db.flowRun.count({ where: { followGained: true, updatedAt: { gte: since } } }),
    db.webhookEvent.count({ where: { status: "FAILED", receivedAt: { gte: since } } }),
  ]);
  const items = [
    ["Comments", comments],
    ["Matched a keyword", matched],
    ["DMs sent", dms],
    ["Links sent", sessionLinks + flowLinks],
    ["Link clicks", clicks._sum.clicks ?? 0],
    ["Follows gained", sessionFollows + flowFollows],
  ] as const;
  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {items.map(([label, value]) => (
          <Card key={label}>
            <div className="text-sm text-neutral-500">{label}</div>
            <div className="mt-1 text-2xl font-semibold">{value}</div>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-sm text-neutral-600">
        Instagram and Facebook combined. Per post: <Link className="underline" href="/stats">stats</Link>.
      </p>
      {failed > 0 && (
        <p className="mt-2 text-sm text-red-700">
          {failed} webhook events failed this week. See the <Link className="underline" href="/comments">comment log</Link>.
        </p>
      )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <>
      <PageTitle title="Last 7 days" />
      <Suspense fallback={<Loading />}>
        <Stats />
      </Suspense>
    </>
  );
}
