import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Badge, Loading, PageTitle } from "@/components/ui";
import { help } from "@/content/help";
import { TriggerForm } from "@/app/triggers/trigger-form";
import { triggerTypeLabel } from "@/app/triggers/trigger-types";
import { db } from "@/lib/db";

async function EditTrigger({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const trigger = await db.trigger.findUnique({ where: { id } });
  if (!trigger) notFound();
  return (
    <>
      <p className="mb-4">
        <Badge>{triggerTypeLabel(trigger.channel, trigger.kind)}</Badge>
      </p>
      <TriggerForm trigger={trigger} channel={trigger.channel} kind={trigger.kind} />
    </>
  );
}

export default function EditTriggerPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <PageTitle title="Edit automation" help={help.automationEdit} />
      <Suspense fallback={<Loading />}>
        <EditTrigger params={params} />
      </Suspense>
    </>
  );
}
