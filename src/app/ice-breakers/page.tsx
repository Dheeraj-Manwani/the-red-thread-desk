import { Suspense } from "react";
import { connection } from "next/server";
import { deleteIceBreaker, republishIceBreakers, saveIceBreaker } from "@/app/actions";
import { buttonClass, Card, Field, inputClass, Loading, PageTitle, secondaryButtonClass } from "@/components/ui";
import { help } from "@/content/help";
import type { Channel, IceBreaker } from "@/generated/prisma/client";
import { channelLabel } from "@/lib/channels";
import { db } from "@/lib/db";
import { listIceBreakers, MAX_ICE_BREAKERS } from "@/lib/engine/icebreakers";

type FlowOption = { id: string; name: string };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function IceBreakerFields({ channel, item, flows }: { channel: Channel; item?: IceBreaker; flows: FlowOption[] }) {
  return (
    <>
      {item && <input type="hidden" name="id" value={item.id} />}
      <input type="hidden" name="channel" value={channel} />
      <div className="grid gap-3 sm:grid-cols-[1fr_5rem]">
        <Field label="Question" hint="80 characters max. Shown as a button on a new chat.">
          <input
            name="question"
            defaultValue={item?.question}
            maxLength={80}
            required
            className={inputClass}
            placeholder="What packages do you have?"
          />
        </Field>
        <Field label="Order">
          <input name="position" type="number" min={0} defaultValue={item?.position ?? 0} className={inputClass} />
        </Field>
      </div>
      <Field label="Flow" hint="Run a flow when tapped, instead of the reply and link below.">
        <select name="flowId" defaultValue={item?.flowId ?? ""} className={inputClass}>
          <option value="">None: send the reply</option>
          {flows.map((f) => (
            <option key={f.id} value={f.id}>
              Flow: {f.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Reply">
        <textarea name="reply" rows={2} defaultValue={item?.reply} className={inputClass} />
      </Field>
      <Field label="Link (optional)" hint="Sent as a tracked short link after the reply.">
        <input name="linkUrl" type="url" defaultValue={item?.linkUrl ?? ""} className={inputClass} placeholder="https://..." />
      </Field>
    </>
  );
}

async function ChannelSection({ channel, flows }: { channel: Channel; flows: FlowOption[] }) {
  const items = await listIceBreakers(channel);
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{channelLabel[channel]}</h2>
        <form action={republishIceBreakers}>
          <input type="hidden" name="channel" value={channel} />
          <button className={secondaryButtonClass}>Publish again</button>
        </form>
      </div>
      {items.length === 0 && <p className="text-sm text-neutral-500">None yet.</p>}
      {items.map((item) => (
        <details key={item.id} className="rounded-md border border-neutral-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">{item.question}</summary>
          <form action={saveIceBreaker} className="mt-3 space-y-3">
            <IceBreakerFields channel={channel} item={item} flows={flows} />
            <button className={buttonClass}>Save</button>
          </form>
          <form action={deleteIceBreaker} className="mt-2">
            <input type="hidden" name="id" value={item.id} />
            <button className={`${secondaryButtonClass} text-red-700`}>Delete</button>
          </form>
        </details>
      ))}
      {items.length < MAX_ICE_BREAKERS && (
        <form action={saveIceBreaker} className="space-y-3 border-t border-neutral-100 pt-4">
          <h3 className="text-sm font-medium">Add a question</h3>
          <IceBreakerFields channel={channel} flows={flows} />
          <button className={buttonClass}>Add and publish</button>
        </form>
      )}
    </Card>
  );
}

async function IceBreakers({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const flows = await db.flow.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const published = typeof sp.published === "string" && sp.published in channelLabel ? (sp.published as Channel) : null;
  const failed = typeof sp.failed === "string" && sp.failed in channelLabel ? (sp.failed as Channel) : null;
  return (
    <div className="space-y-4">
      {published && <p className="text-sm text-green-700">Published to {channelLabel[published]}.</p>}
      {failed && (
        <p className="text-sm text-red-700">
          Saved, but publishing to {channelLabel[failed]} failed. Check the server log, then use “Publish again”.
        </p>
      )}
      <p className="text-sm text-neutral-600">
        Up to {MAX_ICE_BREAKERS} questions per channel, shown when someone opens a new chat with you. Changes publish to Meta
        when you save.
      </p>
      <ChannelSection channel="INSTAGRAM" flows={flows} />
      <ChannelSection channel="FACEBOOK" flows={flows} />
      <ChannelSection channel="WHATSAPP" flows={flows} />
    </div>
  );
}

export default function IceBreakersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageTitle title="Ice breakers" help={help.iceBreakers} />
      <Suspense fallback={<Loading />}>
        <IceBreakers searchParams={searchParams} />
      </Suspense>
    </>
  );
}
