import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { createFlow, deleteFlow } from "@/app/actions";
import { buttonClass, Card, inputClass, Loading, PageTitle, secondaryButtonClass } from "@/components/ui";
import { help } from "@/content/help";
import { db } from "@/lib/db";
import { parseGraph } from "@/lib/flows/graph";
import { formatDateTime } from "@/lib/format";

async function FlowList() {
  await connection();
  const flows = await db.flow.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      triggers: { select: { id: true, name: true } },
      iceBreakers: { select: { id: true, question: true } },
      _count: { select: { runs: true } },
    },
  });
  return (
    <div className="space-y-3">
      <Card>
        <form action={createFlow} className="flex flex-wrap gap-2">
          <input name="name" required maxLength={80} placeholder="Package enquiry" className={`${inputClass} max-w-xs`} />
          <button className={buttonClass}>New flow</button>
        </form>
      </Card>
      {flows.length === 0 && (
        <Card>
          <p className="text-sm text-neutral-600">
            No flows yet. A flow is a conversation with branches, questions and a package picker. Attach it to an automation
            or an ice breaker.
          </p>
        </Card>
      )}
      {flows.map((f) => {
        const steps = parseGraph(f.graph).nodes.length - 1;
        const usedBy = [...f.triggers.map((t) => t.name), ...f.iceBreakers.map((i) => `ice breaker “${i.question}”`)];
        return (
          <Card key={f.id} className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <Link href={`/flows/${f.id}`} className="font-medium hover:underline">
                {f.name}
              </Link>
              <p className="text-sm text-neutral-600">
                {steps} step{steps === 1 ? "" : "s"} · {f._count.runs} runs · edited {formatDateTime(f.updatedAt)}
              </p>
              <p className="text-sm text-neutral-500">Used by: {usedBy.length ? usedBy.join(", ") : "nothing yet"}</p>
            </div>
            <form action={deleteFlow}>
              <input type="hidden" name="id" value={f.id} />
              <button className={`${secondaryButtonClass} text-red-700`}>Delete</button>
            </form>
          </Card>
        );
      })}
    </div>
  );
}

export default function FlowsPage() {
  return (
    <>
      <PageTitle title="Flows" help={help.flows} />
      <Suspense fallback={<Loading />}>
        <FlowList />
      </Suspense>
    </>
  );
}
