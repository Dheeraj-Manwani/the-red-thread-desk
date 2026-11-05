import { Suspense } from "react";
import { connection } from "next/server";
import { syncCatalogueNow, toggleCarousel } from "@/app/actions";
import { Badge, buttonClass, Card, Loading, PageTitle, secondaryButtonClass } from "@/components/ui";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

type SearchParams = Promise<Record<string, string | undefined>>;

async function Catalogue({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const items = await db.catalogueItem.findMany({ orderBy: [{ active: "desc" }, { position: "asc" }, { name: "asc" }] });
  const lastSync = items.reduce<Date | null>((d, i) => (i.syncedAt && (!d || i.syncedAt > d) ? i.syncedAt : d), null);
  const configured = Boolean(process.env.CATALOGUE_URL);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <form action={syncCatalogueNow}>
          <button className={buttonClass} disabled={!configured}>
            Sync from the site
          </button>
        </form>
        <span className="text-sm text-neutral-600">
          {configured ? `Last sync: ${formatDateTime(lastSync)} · daily at 03:30 IST` : "Set CATALOGUE_URL in .env first."}
        </span>
      </div>
      {sp.synced && (
        <p className="text-sm text-green-700">
          Synced {sp.synced} designs{Number(sp.skipped) ? `, skipped ${sp.skipped} without an id or name` : ""}
          {Number(sp.off) ? `, ${sp.off} no longer on the site` : ""}.
        </p>
      )}
      {sp.failed && <p className="text-sm text-red-700">Sync failed. Check the server log and CATALOGUE_URL.</p>}

      {items.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-600">No designs yet. Sync from the Red Thread site to fill the carousel.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((d) => (
            <Card key={d.id} className={`space-y-2 p-3 ${d.active ? "" : "opacity-50"}`}>
              {d.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.imageUrl} alt={d.name} className="aspect-square w-full rounded object-cover" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded bg-neutral-100 text-xs text-neutral-500">
                  No image
                </div>
              )}
              <div className="space-y-1 text-sm">
                <p className="font-medium">{d.name}</p>
                <p className="text-neutral-600">
                  {d.priceInr ? `₹${d.priceInr.toLocaleString("en-IN")}` : "No price"}
                  {d.occasion ? ` · ${d.occasion}` : ""}
                </p>
                <div className="flex flex-wrap gap-1">
                  {!d.active && <Badge>not on site</Badge>}
                  {d.showInCarousel && d.active && <Badge tone="green">in carousel</Badge>}
                  {d.previewUrl && (
                    <a href={d.previewUrl} target="_blank" rel="noreferrer" className="text-xs text-red-700 hover:underline">
                      Preview
                    </a>
                  )}
                </div>
              </div>
              <form action={toggleCarousel}>
                <input type="hidden" name="id" value={d.id} />
                <button className={`${secondaryButtonClass} w-full text-xs`}>
                  {d.showInCarousel ? "Hide from carousel" : "Show in carousel"}
                </button>
              </form>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CataloguePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageTitle title="Catalogue" />
      <Suspense fallback={<Loading />}>
        <Catalogue searchParams={searchParams} />
      </Suspense>
    </>
  );
}
