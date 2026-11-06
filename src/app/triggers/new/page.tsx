import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Loading, PageTitle } from "@/components/ui";
import { help } from "@/content/help";
import { TriggerForm } from "@/app/triggers/trigger-form";
import { triggerTypes, type TriggerTypeKey as TypeKey } from "@/app/triggers/trigger-types";

async function NewTrigger({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await connection();
  const { type } = await searchParams;
  const key: TypeKey = type && type in triggerTypes ? (type as TypeKey) : "ig-comment";
  const { channel, kind } = triggerTypes[key];
  return (
    <>
      <nav className="mb-6 flex flex-wrap gap-2 text-sm">
        {(Object.keys(triggerTypes) as TypeKey[]).map((k) => (
          <Link
            key={k}
            href={`/triggers/new?type=${k}`}
            className={`rounded-md border px-3 py-1.5 ${
              k === key ? "border-red-700 bg-red-50 text-red-800" : "border-neutral-300 bg-white hover:bg-neutral-100"
            }`}
          >
            {triggerTypes[k].label}
          </Link>
        ))}
      </nav>
      <TriggerForm key={key} channel={channel} kind={kind} />
    </>
  );
}

export default function NewTriggerPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  return (
    <>
      <PageTitle title="New automation" help={help.automationNew} />
      <Suspense fallback={<Loading />}>
        <NewTrigger searchParams={searchParams} />
      </Suspense>
    </>
  );
}
