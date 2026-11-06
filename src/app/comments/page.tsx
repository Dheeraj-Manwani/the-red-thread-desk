import { Suspense } from "react";
import { connection } from "next/server";
import { Badge, Card, Loading, PageTitle } from "@/components/ui";
import { help } from "@/content/help";
import { channelLabel } from "@/lib/channels";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

const statusTone = {
  LINK_SENT: "green",
  AWAITING_FOLLOW: "amber",
  AWAITING_TAP: "grey",
} as const;

async function CommentTable() {
  await connection();
  const [comments, failedEvents] = await Promise.all([
    db.comment.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { trigger: { select: { name: true } }, session: { include: { shortLink: true } } },
    }),
    db.webhookEvent.findMany({ where: { status: "FAILED" }, orderBy: { receivedAt: "desc" }, take: 10 }),
  ]);

  return (
    <div className="space-y-6">
      {failedEvents.length > 0 && (
        <Card className="space-y-2 border-red-200">
          <h2 className="font-medium text-red-800">Failed webhook events</h2>
          {failedEvents.map((e) => (
            <p key={e.id} className="text-sm text-neutral-700">
              {formatDateTime(e.receivedAt)} · {e.kind} · {e.error}
            </p>
          ))}
        </Card>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">From</th>
              <th className="px-4 py-2 font-medium">Comment</th>
              <th className="px-4 py-2 font-medium">Automation</th>
              <th className="px-4 py-2 font-medium">Result</th>
              <th className="px-4 py-2 font-medium">Clicks</th>
            </tr>
          </thead>
          <tbody>
            {comments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-neutral-500">
                  No comments yet. Comment on one of your posts from another account to test.
                </td>
              </tr>
            )}
            {comments.map((c) => (
              <tr key={c.id} className="border-b border-neutral-100 align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-2 text-neutral-500">{formatDateTime(c.createdAt)}</td>
                <td className="space-y-1 px-4 py-2">
                  <Badge>{channelLabel[c.channel]}</Badge>
                  <p>{c.fromUsername ? (c.channel === "INSTAGRAM" ? `@${c.fromUsername}` : c.fromUsername) : c.fromId}</p>
                </td>
                <td className="max-w-xs px-4 py-2">{c.text}</td>
                <td className="px-4 py-2">{c.trigger?.name ?? <span className="text-neutral-400">none</span>}</td>
                <td className="space-y-1 px-4 py-2">
                  {c.session ? (
                    <Badge tone={statusTone[c.session.status]}>{c.session.status.replaceAll("_", " ").toLowerCase()}</Badge>
                  ) : c.skipReason ? (
                    <Badge>{c.skipReason.replaceAll("_", " ")}</Badge>
                  ) : (
                    <Badge>no match</Badge>
                  )}
                  {c.error && <p className="text-xs text-red-700">{c.error}</p>}
                </td>
                <td className="px-4 py-2">{c.session?.shortLink?.clicks ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export default function CommentsPage() {
  return (
    <>
      <PageTitle title="Comment log" help={help.comments} />
      <Suspense fallback={<Loading />}>
        <CommentTable />
      </Suspense>
    </>
  );
}
