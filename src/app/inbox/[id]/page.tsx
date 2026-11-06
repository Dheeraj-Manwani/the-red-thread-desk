import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  addContactTag,
  handBack,
  removeContactTag,
  sendPaymentLink,
  sendReply,
  setMarketingOptIn,
  takeOver,
} from "@/app/actions";
import { AutoRefresh } from "@/app/inbox/auto-refresh";
import { InfoButton } from "@/components/info-button";
import { Badge, buttonClass, Card, inputClass, Loading, secondaryButtonClass } from "@/components/ui";
import { help } from "@/content/help";
import { channelLabel } from "@/lib/channels";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { displayName, HANDOFF_HOURS, inHandoff, replyWindowOpen } from "@/lib/inbox";
import { orderLabel, stageLabels } from "@/lib/orders";
import { razorpayConfigured } from "@/lib/razorpay";

type Item =
  | { kind: "message"; at: Date; id: string; out: boolean; source: string; text: string; buttons: string[] }
  | { kind: "comment"; at: Date; id: string; text: string; mediaId: string; automation?: string };

const sourceLabel: Record<string, string> = { BOT: "Bot", ADMIN: "You", APP: "You (app)", CONTACT: "" };

async function Thread({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const contact = await db.contact.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 200 },
      comments: { orderBy: { createdAt: "desc" }, take: 20, include: { trigger: { select: { name: true } } } },
      tags: { include: { tag: true }, orderBy: { createdAt: "asc" } },
      links: { orderBy: { createdAt: "desc" }, take: 10 },
      flowRuns: { orderBy: { updatedAt: "desc" }, take: 5, include: { flow: { select: { name: true } } } },
      orders: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!contact) notFound();
  const packages = await db.package.findMany({
    where: { active: true },
    orderBy: [{ position: "asc" }, { priceInr: "asc" }],
  });
  const canCharge = razorpayConfigured();
  // Same phone number = same person on another channel.
  const linked = contact.phone
    ? await db.contact.findMany({ where: { phone: contact.phone, id: { not: contact.id } } })
    : [];

  // Opening the thread marks it read.
  if (contact.lastInboundAt && (!contact.lastReadAt || contact.lastInboundAt > contact.lastReadAt)) {
    await db.contact.update({ where: { id }, data: { lastReadAt: new Date() } });
  }

  const now = new Date();
  const paused = inHandoff(contact, now);
  const canReply = replyWindowOpen(contact, now);
  const fields = Object.entries((contact.fields ?? {}) as Record<string, string>);

  const items: Item[] = [
    ...contact.messages.map(
      (m): Item => ({
        kind: "message",
        at: m.createdAt,
        id: m.id,
        out: m.direction === "OUT",
        source: m.source,
        text: m.text,
        buttons: m.buttons,
      }),
    ),
    ...contact.comments.map(
      (c): Item => ({ kind: "comment", at: c.createdAt, id: c.id, text: c.text, mediaId: c.mediaId, automation: c.trigger?.name }),
    ),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <AutoRefresh />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/inbox" className="text-sm text-neutral-600 hover:underline">
            ← Inbox
          </Link>
          <h1 className="text-lg font-semibold">{displayName(contact)}</h1>
          <InfoButton help={help.conversation} />
          <Badge>{channelLabel[contact.channel]}</Badge>
          {contact.handoffAskedAt && <Badge tone="red">asked for you</Badge>}
          {paused ? (
            <Badge tone="amber">bot paused until {formatDateTime(contact.handoffUntil)}</Badge>
          ) : (
            <Badge tone="green">bot on</Badge>
          )}
        </div>

        <Card className="max-h-[60vh] space-y-2 overflow-y-auto">
          {items.length === 0 && <p className="text-sm text-neutral-500">No messages yet.</p>}
          {items.map((item) =>
            item.kind === "comment" ? (
              <div key={`c-${item.id}`} className="text-center text-xs text-neutral-500">
                Commented “{item.text}” on post {item.mediaId}
                {item.automation ? ` · automation: ${item.automation}` : ""} · {formatDateTime(item.at)}
              </div>
            ) : (
              <div key={item.id} className={`flex ${item.out ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    item.out
                      ? item.source === "BOT"
                        ? "bg-neutral-100 text-neutral-800"
                        : "bg-red-700 text-white"
                      : "border border-neutral-200 bg-white"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{item.text}</p>
                  {item.buttons.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {item.buttons.map((b) => (
                        <span key={b} className="rounded-full border border-current/30 px-2 text-[11px]">
                          {b}
                        </span>
                      ))}
                    </p>
                  )}
                  <p className={`mt-1 text-[10px] ${item.out && item.source !== "BOT" ? "text-red-100" : "text-neutral-400"}`}>
                    {sourceLabel[item.source]}
                    {sourceLabel[item.source] ? " · " : ""}
                    {formatDateTime(item.at)}
                  </p>
                </div>
              </div>
            ),
          )}
        </Card>

        {canReply ? (
          <form action={sendReply} className="space-y-2">
            <input type="hidden" name="contactId" value={contact.id} />
            <textarea name="text" rows={3} required maxLength={1000} className={inputClass} placeholder="Write a reply…" />
            <div className="flex items-center gap-3">
              <button className={buttonClass}>Send</button>
              <span className="text-xs text-neutral-500">Replying pauses the bot for {HANDOFF_HOURS} h.</span>
            </div>
          </form>
        ) : (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Meta only allows replies within 24 hours of the person&apos;s last message
            {contact.lastInboundAt ? ` (last: ${formatDateTime(contact.lastInboundAt)})` : ""}. Reply from the{" "}
            {channelLabel[contact.channel]} app, or wait for them to message again.
          </p>
        )}
      </div>

      <aside className="space-y-3">
        <Card className="space-y-2 text-sm">
          <h2 className="font-medium">Bot</h2>
          {paused ? (
            <form action={handBack}>
              <input type="hidden" name="contactId" value={contact.id} />
              <button className={secondaryButtonClass}>Hand back to bot</button>
            </form>
          ) : (
            <form action={takeOver}>
              <input type="hidden" name="contactId" value={contact.id} />
              <button className={secondaryButtonClass}>Take over ({HANDOFF_HOURS} h)</button>
            </form>
          )}
          <p className="text-xs text-neutral-500">
            While paused, automations and flows don&apos;t message this person. Replying here or in the app pauses it too.
          </p>
        </Card>

        <Card className="space-y-1 text-sm">
          <h2 className="font-medium">Contact</h2>
          <p>Follower: {contact.isFollower === null ? "unknown" : contact.isFollower ? "yes" : "no"}</p>
          <p>Automatic messages: {contact.optedOut ? "off (sent STOP)" : "on"}</p>
          {contact.phone && <p>Phone: +{contact.phone}</p>}
          {linked.map((l) => (
            <p key={l.id}>
              Also on {channelLabel[l.channel]}:{" "}
              <Link href={`/inbox/${l.id}`} className="hover:underline">
                {displayName(l)}
              </Link>
            </p>
          ))}
          {contact.channel === "WHATSAPP" && (
            <form action={setMarketingOptIn} className="pt-1">
              <input type="hidden" name="contactId" value={contact.id} />
              <input type="hidden" name="on" value={contact.marketingOptInAt ? "0" : "1"} />
              <p>
                WhatsApp offers:{" "}
                {contact.marketingOptInAt ? `opted in ${formatDateTime(contact.marketingOptInAt)}` : "not opted in"}
              </p>
              <button className={`${secondaryButtonClass} mt-1 text-xs`}>
                {contact.marketingOptInAt ? "Remove opt-in" : "They agreed in chat: opt in"}
              </button>
            </form>
          )}
          <p className="text-xs text-neutral-500">First seen {formatDateTime(contact.createdAt)}</p>
        </Card>

        <Card className="space-y-2 text-sm">
          <h2 className="font-medium">Orders</h2>
          {contact.orders.length === 0 && <p className="text-neutral-500">None yet.</p>}
          {contact.orders.map((o) => (
            <p key={o.id}>
              <Link href={`/orders/${o.id}`} className="hover:underline">
                {orderLabel(o)}
              </Link>{" "}
              · {o.title} · ₹{o.amountInr.toLocaleString("en-IN")} ·{" "}
              <span className={o.paymentStatus === "PAID" ? "text-green-700" : "text-neutral-500"}>
                {o.paymentStatus === "PAID" ? "paid" : stageLabels[o.stage].toLowerCase()}
              </span>
            </p>
          ))}
          {canReply && canCharge && (
            <form action={sendPaymentLink} className="space-y-2 border-t border-neutral-100 pt-2">
              <input type="hidden" name="contactId" value={contact.id} />
              <select name="packageId" defaultValue="" className={inputClass}>
                <option value="">Custom amount ↓</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · ₹{p.priceInr.toLocaleString("en-IN")}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <input name="title" placeholder="For (custom)" maxLength={80} className={inputClass} />
                <input name="amountInr" type="number" min={1} placeholder="₹" className={inputClass} />
              </div>
              <button className={secondaryButtonClass}>Send payment link</button>
            </form>
          )}
          {!canCharge && <p className="text-xs text-neutral-500">Add Razorpay keys in .env to send payment links.</p>}
        </Card>

        <Card className="space-y-2 text-sm">
          <h2 className="font-medium">Tags</h2>
          <div className="flex flex-wrap gap-1">
            {contact.tags.length === 0 && <span className="text-neutral-500">None</span>}
            {contact.tags.map(({ tag }) => (
              <form key={tag.id} action={removeContactTag} className="inline">
                <input type="hidden" name="contactId" value={contact.id} />
                <input type="hidden" name="tagId" value={tag.id} />
                <button className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-100" title="Remove">
                  {tag.name} ✕
                </button>
              </form>
            ))}
          </div>
          <form action={addContactTag} className="flex gap-2">
            <input type="hidden" name="contactId" value={contact.id} />
            <input name="tag" required maxLength={40} placeholder="Add tag" className={inputClass} />
            <button className={secondaryButtonClass}>Add</button>
          </form>
        </Card>

        {fields.length > 0 && (
          <Card className="space-y-1 text-sm">
            <h2 className="font-medium">Answers</h2>
            {fields.map(([k, v]) => (
              <p key={k}>
                <span className="text-neutral-500">{k}:</span> {String(v)}
              </p>
            ))}
          </Card>
        )}

        {(contact.links.length > 0 || contact.flowRuns.length > 0) && (
          <Card className="space-y-1 text-sm">
            <h2 className="font-medium">Activity</h2>
            {contact.flowRuns.map((r) => (
              <p key={r.id}>
                Flow “{r.flow.name}”: {r.status.toLowerCase().replaceAll("_", " ")}
              </p>
            ))}
            {contact.links.map((l) => (
              <p key={l.id} className="truncate">
                Link {l.clicks ? `clicked ${l.clicks}×` : "not clicked"} · {l.url}
              </p>
            ))}
          </Card>
        )}
      </aside>
    </div>
  );
}

export default function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <Thread params={params} />
    </Suspense>
  );
}
