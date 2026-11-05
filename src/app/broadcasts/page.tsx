import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { cancelBroadcast, confirmBroadcast, createBroadcast, createTemplate, syncTemplatesNow } from "@/app/actions";
import { Badge, buttonClass, Card, Field, inputClass, Loading, PageTitle, secondaryButtonClass } from "@/components/ui";
import type { BroadcastStatus } from "@/generated/prisma/client";
import { audienceWhere, bodyText, estimateCost, GST, rateFor, variableCount } from "@/lib/broadcasts";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { whatsappConfigured } from "@/lib/whatsapp";

type SearchParams = Promise<Record<string, string | undefined>>;

const statusTone: Record<BroadcastStatus, "green" | "amber" | "grey" | "red"> = {
  DRAFT: "grey",
  SCHEDULED: "amber",
  SENDING: "amber",
  DONE: "green",
  CANCELLED: "red",
};

function Tabs({ tab }: { tab: string }) {
  return (
    <nav className="flex gap-2 text-sm">
      {[
        ["broadcasts", "Broadcasts"],
        ["templates", "Templates"],
      ].map(([t, label]) => (
        <Link
          key={t}
          href={`/broadcasts?tab=${t}`}
          className={`rounded-md border px-3 py-1.5 ${
            t === tab ? "border-red-700 bg-red-50 text-red-800" : "border-neutral-300 bg-white hover:bg-neutral-100"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

async function Review({ id }: { id: string }) {
  const b = await db.broadcast.findUnique({ where: { id }, include: { template: true } });
  if (!b || b.status !== "DRAFT") return null;
  const count = await db.contact.count({ where: audienceWhere(b.tag) });
  const cost = estimateCost(count, b.template.category);
  return (
    <Card className="space-y-3 border-amber-300">
      <h2 className="font-medium">Check before sending: {b.name}</h2>
      <p className="text-sm">
        Template <strong>{b.template.name}</strong> ({b.template.category.toLowerCase()}, {b.template.language}) to{" "}
        <strong>{count}</strong> opted-in WhatsApp contact{count === 1 ? "" : "s"}
        {b.tag ? ` tagged “${b.tag}”` : ""}.
      </p>
      <p className="text-sm">
        Estimated cost: <strong>₹{cost.toLocaleString("en-IN")}</strong> (₹{rateFor(b.template.category)} per message +{" "}
        {GST * 100}% GST). {b.scheduledAt ? `Scheduled for ${formatDateTime(b.scheduledAt)}.` : "Sends right away."}
      </p>
      <p className="whitespace-pre-wrap rounded bg-neutral-50 p-3 text-sm text-neutral-700">{bodyText(b.template.components)}</p>
      <div className="flex gap-2">
        <form action={confirmBroadcast}>
          <input type="hidden" name="id" value={b.id} />
          <button className={buttonClass}>{b.scheduledAt ? "Schedule" : `Send to ${count} now`}</button>
        </form>
        <form action={cancelBroadcast}>
          <input type="hidden" name="id" value={b.id} />
          <button className={secondaryButtonClass}>Discard</button>
        </form>
      </div>
    </Card>
  );
}

async function BroadcastsTab({ review }: { review?: string }) {
  const [broadcasts, templates, tags, optedIn] = await Promise.all([
    db.broadcast.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { template: { select: { name: true, category: true } }, recipients: { select: { status: true } } },
    }),
    db.waTemplate.findMany({ where: { status: "APPROVED" }, orderBy: { name: "asc" } }),
    db.tag.findMany({ orderBy: { name: "asc" } }),
    db.contact.count({ where: audienceWhere(null) }),
  ]);
  const maxVars = Math.max(0, ...templates.map((t) => variableCount(t.components)));

  return (
    <div className="space-y-4">
      {review && <Review id={review} />}
      <Card className="space-y-3">
        <h2 className="font-medium">New broadcast</h2>
        <p className="text-sm text-neutral-600">
          {optedIn} WhatsApp contact{optedIn === 1 ? " has" : "s have"} opted in. Only they get broadcasts; add a
          “WhatsApp offers opt-in” step to a flow to ask.
        </p>
        {templates.length === 0 ? (
          <p className="text-sm text-amber-700">No approved templates yet. Create or sync one under Templates.</p>
        ) : (
          <form action={createBroadcast} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <input name="name" required maxLength={80} placeholder="Muhurat season – Nov" className={inputClass} />
              </Field>
              <Field label="Template">
                <select name="templateId" required className={inputClass}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.language}, {t.category.toLowerCase()}, {variableCount(t.components)} variables)
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Only contacts tagged (optional)">
                <select name="tag" defaultValue="" className={inputClass}>
                  <option value="">Everyone opted in</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Send at (India time; empty = now)">
                <input name="scheduledAt" type="datetime-local" className={inputClass} />
              </Field>
            </div>
            {maxVars > 0 && (
              <div className="grid gap-3 sm:grid-cols-3">
                {Array.from({ length: maxVars }, (_, i) => (
                  <Field key={i} label={`{{${i + 1}}}`} hint="{name}, a field like {city}, or fixed text">
                    <input name={`var${i + 1}`} defaultValue={i === 0 ? "{name}" : ""} className={inputClass} />
                  </Field>
                ))}
              </div>
            )}
            <button className={buttonClass}>Review cost</button>
          </form>
        )}
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Broadcast</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Sent</th>
              <th className="px-4 py-2 text-right font-medium">Delivered</th>
              <th className="px-4 py-2 text-right font-medium">Read</th>
              <th className="px-4 py-2 text-right font-medium">Failed</th>
              <th className="px-4 py-2 text-right font-medium">Est. ₹</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {broadcasts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-neutral-500">
                  No broadcasts yet.
                </td>
              </tr>
            )}
            {broadcasts.map((b) => {
              const n = (s: string[]) => b.recipients.filter((r) => s.includes(r.status)).length;
              return (
                <tr key={b.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-2">
                    <p className="font-medium">{b.name}</p>
                    <p className="text-xs text-neutral-500">
                      {b.template.name}
                      {b.tag ? ` · tag ${b.tag}` : ""} · {formatDateTime(b.scheduledAt ?? b.createdAt)}
                    </p>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={statusTone[b.status]}>{b.status.toLowerCase()}</Badge>
                  </td>
                  <td className="px-4 py-2 text-right">{n(["SENT", "DELIVERED", "READ"])}</td>
                  <td className="px-4 py-2 text-right">{n(["DELIVERED", "READ"])}</td>
                  <td className="px-4 py-2 text-right">{n(["READ"])}</td>
                  <td className="px-4 py-2 text-right">{n(["FAILED"])}</td>
                  <td className="px-4 py-2 text-right">{b.estimatedCostInr?.toLocaleString("en-IN") ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {(b.status === "SCHEDULED" || b.status === "SENDING") && (
                      <form action={cancelBroadcast}>
                        <input type="hidden" name="id" value={b.id} />
                        <button className={`${secondaryButtonClass} text-xs`}>Stop</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

async function TemplatesTab({ sp }: { sp: Record<string, string | undefined> }) {
  const templates = await db.waTemplate.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <form action={syncTemplatesNow}>
          <button className={secondaryButtonClass}>Sync from WhatsApp</button>
        </form>
        {sp.synced && <span className="text-sm text-green-700">Synced {sp.synced} templates.</span>}
        {sp.submitted && <span className="text-sm text-green-700">Sent to Meta for review. Status updates arrive by webhook.</span>}
        {sp.failed && <span className="text-sm text-red-700">Sync failed: check the server log.</span>}
      </div>
      <Card className="divide-y divide-neutral-100 p-0">
        {templates.length === 0 && <p className="px-4 py-6 text-sm text-neutral-500">No templates yet.</p>}
        {templates.map((t) => (
          <div key={t.id} className="space-y-1 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{t.name}</span>
              <Badge tone={t.status === "APPROVED" ? "green" : t.status === "REJECTED" ? "red" : "amber"}>
                {t.status.toLowerCase()}
              </Badge>
              <Badge>{t.category.toLowerCase()}</Badge>
              <Badge>{t.language}</Badge>
              <span className="text-xs text-neutral-500">
                ₹{rateFor(t.category)} + GST per message outside the 24 h window
              </span>
            </div>
            <p className="whitespace-pre-wrap text-neutral-700">{bodyText(t.components)}</p>
            {t.reason && <p className="text-xs text-red-700">Reason: {t.reason}</p>}
          </div>
        ))}
      </Card>
      <Card className="space-y-3">
        <h2 className="font-medium">New template</h2>
        <form action={createTemplate} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name" hint="lowercase_with_underscores">
              <input name="name" required pattern="[a-z0-9_]+" placeholder="muhurat_offer" className={inputClass} />
            </Field>
            <Field label="Category" hint="Marketing for offers; utility for order updates.">
              <select name="category" defaultValue="MARKETING" className={inputClass}>
                <option value="MARKETING">Marketing</option>
                <option value="UTILITY">Utility</option>
              </select>
            </Field>
            <Field label="Language">
              <select name="language" defaultValue="en" className={inputClass}>
                <option value="en">English</option>
                <option value="en_US">English (US)</option>
                <option value="hi">Hindi</option>
              </select>
            </Field>
          </div>
          <Field label="Body" hint="Use {{1}}, {{2}} for variables. Hinglish and Devanagari are fine.">
            <textarea
              name="body"
              rows={4}
              required
              maxLength={1024}
              className={inputClass}
              placeholder="Hi {{1}}! Muhurat season offer: 20% off all wedding invites till {{2}}."
            />
          </Field>
          <Field label="Example per variable" hint="One per line, in order. Meta needs these to review.">
            <textarea name="examples" rows={2} className={inputClass} placeholder={"Priya\n30 Nov"} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Footer (optional)">
              <input name="footer" maxLength={60} placeholder="Reply STOP to opt out" className={inputClass} />
            </Field>
            <Field label="Quick reply buttons (optional)" hint="Up to 3, one per line.">
              <textarea name="quickReplies" rows={2} className={inputClass} placeholder={"Show designs\nStop promotions"} />
            </Field>
          </div>
          <button className={buttonClass}>Submit for approval</button>
        </form>
      </Card>
    </div>
  );
}

async function Broadcasts({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const tab = sp.tab === "templates" ? "templates" : "broadcasts";
  if (!whatsappConfigured()) {
    return (
      <Card>
        <p className="text-sm text-amber-700">
          Connect WhatsApp first: set WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID and WHATSAPP_ACCESS_TOKEN.
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Tabs tab={tab} />
      {tab === "templates" ? <TemplatesTab sp={sp} /> : <BroadcastsTab review={sp.review} />}
    </div>
  );
}

export default function BroadcastsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageTitle title="WhatsApp broadcasts" />
      <Suspense fallback={<Loading />}>
        <Broadcasts searchParams={searchParams} />
      </Suspense>
    </>
  );
}
