import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Loading, PageTitle } from "@/components/ui";
import { TriggerForm } from "@/app/triggers/trigger-form";
import { db } from "@/lib/db";

async function EditTrigger({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const trigger = await db.commentTrigger.findUnique({ where: { id } });
  if (!trigger) notFound();
  return <TriggerForm trigger={trigger} />;
}

export default function EditTriggerPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <PageTitle title="Edit comment automation" />
      <Suspense fallback={<Loading />}>
        <EditTrigger params={params} />
      </Suspense>
    </>
  );
}
