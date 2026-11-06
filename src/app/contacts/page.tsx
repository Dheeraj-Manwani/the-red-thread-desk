import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Badge, Card, inputClass, Loading, PageTitle, secondaryButtonClass } from "@/components/ui";
import { help } from "@/content/help";
import type { Prisma } from "@/generated/prisma/client";
import { channelLabel } from "@/lib/channels";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/inbox";

type SearchParams = Promise<{ q?: string; tag?: string; channel?: string; page?: string }>;
const PAGE_SIZE = 50;

async function ContactTable({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const tag = sp.tag?.trim().toLowerCase() ?? "";
  const channel =
    sp.channel === "INSTAGRAM" || sp.channel === "FACEBOOK" || sp.channel === "WHATSAPP" ? sp.channel : undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.ContactWhereInput = {
    ...(channel ? { channel } : {}),
    ...(tag ? { tags: { some: { tag: { name: tag } } } } : {}),
    ...(q
      ? { OR: [{ username: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }
      : {}),
  };
  const [total, contacts, tags] = await Promise.all([
    db.contact.count({ where }),
    db.contact.findMany({
      where,
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { tags: { include: { tag: true } }, _count: { select: { comments: true } } },
    }),
    db.tag.findMany({ orderBy: { name: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) =>
    `/contacts?${new URLSearchParams({ ...(q && { q }), ...(tag && { tag }), ...(channel && { channel }), page: String(p) })}`;

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search name" className={`${inputClass} w-48`} />
        <select name="tag" defaultValue={tag} className={`${inputClass} w-40`}>
          <option value="">Any tag</option>
          {tags.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <select name="channel" defaultValue={channel ?? ""} className={`${inputClass} w-40`}>
          <option value="">All channels</option>
          <option value="INSTAGRAM">Instagram</option>
          <option value="FACEBOOK">Facebook</option>
          <option value="WHATSAPP">WhatsApp</option>
        </select>
        <button className={secondaryButtonClass}>Filter</button>
      </form>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Tags</th>
              <th className="px-4 py-2 font-medium">Follower</th>
              <th className="px-4 py-2 font-medium">Comments</th>
              <th className="px-4 py-2 font-medium">Last message</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-neutral-500">
                  No contacts match.
                </td>
              </tr>
            )}
            {contacts.map((c) => (
              <tr key={c.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2">
                  <Link href={`/inbox/${c.id}`} className="font-medium hover:underline">
                    {displayName(c)}
                  </Link>{" "}
                  <Badge>{channelLabel[c.channel]}</Badge> {c.optedOut && <Badge tone="red">STOP</Badge>}
                </td>
                <td className="px-4 py-2">{c.tags.map(({ tag: t }) => t.name).join(", ") || "—"}</td>
                <td className="px-4 py-2">{c.isFollower === null ? "?" : c.isFollower ? "yes" : "no"}</td>
                <td className="px-4 py-2">{c._count.comments}</td>
                <td className="whitespace-nowrap px-4 py-2 text-neutral-500">{formatDateTime(c.lastMessageAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center gap-3 text-sm text-neutral-600">
        <span>
          {total} contact{total === 1 ? "" : "s"} · page {page} of {pages}
        </span>
        {page > 1 && (
          <Link href={qs(page - 1)} className="hover:underline">
            ← Previous
          </Link>
        )}
        {page < pages && (
          <Link href={qs(page + 1)} className="hover:underline">
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}

export default function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageTitle title="Contacts" help={help.contacts} />
      <Suspense fallback={<Loading />}>
        <ContactTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}
