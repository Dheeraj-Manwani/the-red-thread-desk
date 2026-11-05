import { Suspense } from "react";
import { connection } from "next/server";
import { Loading, PageTitle } from "@/components/ui";
import { TriggerForm } from "@/app/triggers/trigger-form";

async function NewTrigger() {
  await connection();
  return <TriggerForm />;
}

export default function NewTriggerPage() {
  return (
    <>
      <PageTitle title="New comment automation" />
      <Suspense fallback={<Loading />}>
        <NewTrigger />
      </Suspense>
    </>
  );
}
