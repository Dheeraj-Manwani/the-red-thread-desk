import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { markOrderPaid, renewPaymentLink, sendOrderMessage, updateOrder } from "@/app/actions";
import { InfoButton } from "@/components/info-button";
import { Badge, buttonClass, Card, Field, inputClass, Loading, secondaryButtonClass } from "@/components/ui";
import { help } from "@/content/help";
import { channelLabel } from "@/lib/channels";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { displayName, replyWindowOpen } from "@/lib/inbox";
import { orderLabel, STAGES, stageLabels, statusMessages } from "@/lib/orders";

type SearchParams = Promise<Record<string, string | undefined>>;

const presetLabels: Record<string, string> = {
  paid: "Payment received",
  details: "Ask for details",
  ready: "Invite is ready",
  edits: "Edits done",
};

async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  await connection();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const order = await db.order.findUnique({
    where: { id },
    include: { contact: true, design: true, package: true, flowRun: { include: { flow: { select: { name: true } } } } },
  });
  if (!order) notFound();
  const details = Object.entries((order.details ?? {}) as Record<string, string>);
  // Photo answers: WhatsApp media IDs (proxied, needs your login) or Instagram / Messenger CDN links.
  const photos = details.flatMap(([, v]) =>
    String(v)
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.startsWith("wa-media:") || /^https:\/\/\S+\.(fbcdn|cdninstagram)\./.test(u) || u.includes("lookaside")),
  );
  const canMessage = replyWindowOpen(order.contact);
  const preset = sp.preset && statusMessages[sp.preset] ? statusMessages[sp.preset].replace("{order}", orderLabel(order)) : "";
  const paid = order.paymentStatus === "PAID";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/orders" className="text-sm text-neutral-600 hover:underline">
            ← Orders
          </Link>
          <h1 className="text-lg font-semibold">{orderLabel(order)}</h1>
          <InfoButton help={help.order} />
          <Badge tone={paid ? "green" : order.paymentStatus === "UNPAID" ? "grey" : "red"}>
            {order.paymentStatus.toLowerCase()}
          </Badge>
          <Badge>{stageLabels[order.stage]}</Badge>
        </div>
        {sp.saved && <p className="text-sm text-green-700">Saved.</p>}
        {sp.sent && <p className="text-sm text-green-700">Message sent.</p>}
        {sp.renewed && <p className="text-sm text-green-700">New payment link created. Send it from the message box below.</p>}

        <Card className="space-y-4">
          <form action={updateOrder} className="space-y-4">
            <input type="hidden" name="id" value={order.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Stage">
                <select name="stage" defaultValue={order.stage} className={inputClass}>
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {stageLabels[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Event date">
                <input
                  name="eventDate"
                  type="date"
                  defaultValue={order.eventDate?.toISOString().slice(0, 10) ?? ""}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Details" hint="One per line as key: value. Flow answers after payment land here.">
              <textarea
                name="details"
                rows={6}
                defaultValue={details.map(([k, v]) => `${k}: ${v}`).join("\n")}
                className={`${inputClass} font-mono text-xs`}
              />
            </Field>
            <Field label="Notes (only you see these)">
              <textarea name="notes" rows={3} defaultValue={order.notes ?? ""} className={inputClass} />
            </Field>
            <button className={buttonClass}>Save</button>
          </form>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-medium">Message the customer</h2>
          {canMessage ? (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.keys(statusMessages).map((k) => (
                  <Link key={k} href={`/orders/${order.id}?preset=${k}`} className={secondaryButtonClass}>
                    {presetLabels[k] ?? k}
                  </Link>
                ))}
              </div>
              <form action={sendOrderMessage} className="space-y-2">
                <input type="hidden" name="id" value={order.id} />
                <textarea
                  key={sp.preset ?? "none"}
                  name="text"
                  rows={3}
                  required
                  maxLength={1000}
                  defaultValue={sp.renewed ? `Here's a new payment link: ${order.razorpayLinkUrl}` : preset}
                  className={inputClass}
                />
                <button className={buttonClass}>Send on {channelLabel[order.channel]}</button>
              </form>
            </>
          ) : (
            <p className="text-sm text-amber-800">
              The 24 h window is closed (last message {formatDateTime(order.contact.lastInboundAt)}). Message them from
              the {channelLabel[order.channel]} app, or wait for them to write.
            </p>
          )}
        </Card>
      </div>

      <aside className="space-y-3">
        <Card className="space-y-1 text-sm">
          <h2 className="font-medium">Order</h2>
          <p>
            {order.title} · ₹{order.amountInr.toLocaleString("en-IN")}
          </p>
          {order.design?.previewUrl && (
            <a href={order.design.previewUrl} target="_blank" rel="noreferrer" className="text-red-700 hover:underline">
              Design preview
            </a>
          )}
          <p className="text-neutral-600">Created {formatDateTime(order.createdAt)}</p>
          {order.paidAt && <p className="text-neutral-600">Paid {formatDateTime(order.paidAt)}</p>}
          {order.razorpayPaymentId && <p className="text-xs text-neutral-500">Payment {order.razorpayPaymentId}</p>}
          {order.flowRun && <p className="text-xs text-neutral-500">From flow “{order.flowRun.flow.name}”</p>}
        </Card>

        <Card className="space-y-2 text-sm">
          <h2 className="font-medium">Payment</h2>
          {order.razorpayLinkUrl && (
            <p className="break-all">
              <a href={order.razorpayLinkUrl} target="_blank" rel="noreferrer" className="text-red-700 hover:underline">
                {order.razorpayLinkUrl}
              </a>
            </p>
          )}
          {!paid && (
            <div className="flex flex-wrap gap-2">
              {order.paymentStatus !== "UNPAID" && (
                <form action={renewPaymentLink}>
                  <input type="hidden" name="id" value={order.id} />
                  <button className={secondaryButtonClass}>New link</button>
                </form>
              )}
              <form action={markOrderPaid}>
                <input type="hidden" name="id" value={order.id} />
                <button className={secondaryButtonClass}>Mark paid (outside Razorpay)</button>
              </form>
            </div>
          )}
        </Card>

        {photos.length > 0 && (
          <Card className="space-y-1 text-sm">
            <h2 className="font-medium">Photos</h2>
            {photos.map((p, i) => (
              <a
                key={p}
                href={p.startsWith("wa-media:") ? `/api/whatsapp/media/${p.slice(9)}` : p}
                target="_blank"
                rel="noreferrer"
                className="block text-red-700 hover:underline"
              >
                Photo {i + 1}
              </a>
            ))}
            <p className="text-xs text-neutral-500">Instagram / Messenger links can expire: save what you need.</p>
          </Card>
        )}

        <Card className="space-y-1 text-sm">
          <h2 className="font-medium">Customer</h2>
          <Link href={`/inbox/${order.contactId}`} className="font-medium hover:underline">
            {displayName(order.contact)}
          </Link>
          <p className="text-neutral-600">{channelLabel[order.channel]}</p>
        </Card>
      </aside>
    </div>
  );
}

export default function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<Loading />}>
      <OrderDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}
