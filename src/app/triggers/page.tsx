import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { deleteTrigger, toggleTrigger } from "@/app/actions";
import { triggerTypeLabel } from "@/app/triggers/trigger-types";
import { Badge, buttonClass, Card, Loading, PageTitle, secondaryButtonClass } from "@/components/ui";
import { db } from "@/lib/db";

const scopeLabel = {
  COMMENT: { POSTS: "Chosen posts", ALL_POSTS: "All posts", DEFAULT: "Default (fallback)" },
  STORY_REPLY: { POSTS: "Chosen stories", ALL_POSTS: "Every story", DEFAULT: "Default (fallback)" },
} as const;

async function TriggerList() {
  await connection();
  const triggers = await db.trigger.findMany({
    orderBy: [{ channel: "asc" }, { kind: "asc" }, { scope: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { comments: true, sessions: { where: { status: "LINK_SENT" } } } } },
  });
  if (triggers.length === 0) {
    return (
      <Card>
        <p className="text-sm text-neutral-600">
          No automations yet. Create one for a reel, a default one for every post, or one for story replies.
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {triggers.map((t) => (
        <Card key={t.id} className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/triggers/${t.id}`} className="font-medium hover:underline">
                {t.name}
              </Link>
              <Badge tone={t.active ? "green" : "grey"}>{t.active ? "Live" : "Paused"}</Badge>
              <Badge>{triggerTypeLabel(t.channel, t.kind)}</Badge>
              <Badge>{scopeLabel[t.kind][t.scope]}</Badge>
              {t.followGate && t.channel === "INSTAGRAM" && <Badge tone="amber">Follow gate</Badge>}
            </div>
            <p className="text-sm text-neutral-600">
              Keywords: {t.keywords.length ? t.keywords.join(", ") : "any text"}
              {t.scope === "POSTS" && ` · ${t.mediaIds.length} post${t.mediaIds.length === 1 ? "" : "s"}`}
            </p>
            <p className="text-sm text-neutral-500">
              {t.kind === "COMMENT" ? `${t._count.comments} comments matched · ` : ""}
              {t._count.sessions} links sent · {t.linkUrl}
            </p>
          </div>
          <div className="flex gap-2">
            <form action={toggleTrigger}>
              <input type="hidden" name="id" value={t.id} />
              <button className={secondaryButtonClass}>{t.active ? "Pause" : "Resume"}</button>
            </form>
            <form action={deleteTrigger}>
              <input type="hidden" name="id" value={t.id} />
              <button className={`${secondaryButtonClass} text-red-700`}>Delete</button>
            </form>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function TriggersPage() {
  return (
    <>
      <PageTitle title="Automations">
        <Link href="/triggers/new" className={buttonClass}>
          New automation
        </Link>
      </PageTitle>
      <Suspense fallback={<Loading />}>
        <TriggerList />
      </Suspense>
    </>
  );
}
