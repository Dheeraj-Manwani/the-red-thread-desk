import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Board, type BoardCard } from "@/app/orders/board";
import { Badge, Card, Loading, PageTitle } from "@/components/ui";
import { db } from "@/lib/db";
import { daysUntil, formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/inbox";
import { orderLabel, STAGES, stageLabels } from "@/lib/orders";

type SearchParams = Promise<{ view?: string }>;

const day = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

async function Orders({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const { view } = await searchParams;
  const list = view === "list";
  const orders = await db.order.findMany({
    orderBy: [{ eventDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 300,
    include: { contact: true, design: { select: { occasion: true } } },
  });
  const cards: BoardCard[] = orders.map((o) => {
    const details = (o.details ?? {}) as Record<string, string>;
    const fields = (o.contact.fields ?? {}) as Record<string, string>;
    return {
      id: o.id,
      label: orderLabel(o),
      stage: o.stage,
      who: displayName(o.contact),
      couple: details.couple_names ?? fields.couple_names ?? null,
      occasion: details.occasion ?? fields.occasion ?? o.design?.occasion ?? null,
      title: o.title,
      amountInr: o.amountInr,
      paid: o.paymentStatus === "PAID",
      eventDate: o.eventDate ? day.format(o.eventDate) : (details.event_date ?? null),
      daysToEvent: o.eventDate ? daysUntil(o.eventDate) : null,
    };
  });

  return (
    <div className="space-y-4">
      <nav className="flex gap-2 text-sm">
        {[
          ["board", "Board"],
          ["list", "List"],
        ].map(([v, label]) => (
          <Link
            key={v}
            href={`/orders?view=${v}`}
            className={`rounded-md border px-3 py-1.5 ${
              (v === "list") === list ? "border-red-700 bg-red-50 text-red-800" : "border-neutral-300 bg-white hover:bg-neutral-100"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {orders.length === 0 && (
        <Card>
          <p className="text-sm text-neutral-600">
            No orders yet. They appear when a flow&apos;s Payment link step runs, or when you send a payment link from the
            inbox.
          </p>
        </Card>
      )}
      {orders.length > 0 && !list && <Board cards={cards} stages={STAGES.map((s) => ({ id: s, label: stageLabels[s] }))} />}
      {orders.length > 0 && list && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Order</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 text-right font-medium">Amount (₹)</th>
                <th className="px-4 py-2 font-medium">Stage</th>
                <th className="px-4 py-2 font-medium">Event</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c, i) => (
                <tr key={c.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-2">
                    <Link href={`/orders/${c.id}`} className="font-medium hover:underline">
                      {c.label}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{c.couple ?? c.who}</td>
                  <td className="px-4 py-2">{c.title}</td>
                  <td className="px-4 py-2 text-right">{c.amountInr.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2">
                    <Badge tone={c.paid ? "green" : "grey"}>{stageLabels[orders[i].stage]}</Badge>
                  </td>
                  <td className="px-4 py-2">{c.eventDate ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-neutral-500">{formatDateTime(orders[i].createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

export default function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="relative left-1/2 w-[calc(100vw-2rem)] max-w-[1600px] -translate-x-1/2">
      <PageTitle title="Orders" />
      <Suspense fallback={<Loading />}>
        <Orders searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
