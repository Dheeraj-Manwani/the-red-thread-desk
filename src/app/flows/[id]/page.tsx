import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FlowBuilder } from "@/app/flows/[id]/flow-builder";
import { Loading } from "@/components/ui";
import { db } from "@/lib/db";
import { parseGraph } from "@/lib/flows/graph";

async function Builder({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const [flow, packages, tags] = await Promise.all([
    db.flow.findUnique({ where: { id } }),
    db.package.findMany({
      where: { active: true },
      orderBy: [{ position: "asc" }, { priceInr: "asc" }],
      select: { name: true, priceInr: true },
    }),
    db.tag.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  if (!flow) notFound();
  return (
    <FlowBuilder
      flowId={flow.id}
      initialName={flow.name}
      initialGraph={parseGraph(flow.graph)}
      packages={packages}
      tags={tags.map((t) => t.name)}
    />
  );
}

export default function FlowPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    // Full width: the canvas needs more room than the 5xl column.
    <div className="relative left-1/2 w-[calc(100vw-2rem)] max-w-[1600px] -translate-x-1/2">
      <p className="mb-3 text-sm">
        <Link href="/flows" className="text-neutral-600 hover:underline">
          ← Flows
        </Link>
      </p>
      <Suspense fallback={<Loading />}>
        <Builder params={params} />
      </Suspense>
    </div>
  );
}
