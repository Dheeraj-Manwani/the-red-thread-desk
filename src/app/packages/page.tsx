import { Suspense } from "react";
import { connection } from "next/server";
import { deletePackage, savePackage } from "@/app/actions";
import { Badge, buttonClass, Card, Field, inputClass, Loading, PageTitle, secondaryButtonClass } from "@/components/ui";
import type { Package } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { QUICK_REPLY_LIMIT } from "@/lib/flows/graph";

function PackageFields({ item }: { item?: Package }) {
  return (
    <>
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_5rem]">
        <Field label="Name" hint="Short: the button shows name + price in 20 characters.">
          <input name="name" defaultValue={item?.name} maxLength={40} required className={inputClass} placeholder="Gold" />
        </Field>
        <Field label="Price (₹)">
          <input name="priceInr" type="number" min={0} defaultValue={item?.priceInr} required className={inputClass} />
        </Field>
        <Field label="Order">
          <input name="position" type="number" min={0} defaultValue={item?.position ?? 0} className={inputClass} />
        </Field>
      </div>
      <Field label="Link">
        <input name="url" type="url" defaultValue={item?.url} required className={inputClass} placeholder="https://..." />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={item?.active ?? true} /> Show in the package picker
      </label>
    </>
  );
}

async function PackageList() {
  await connection();
  const items = await db.package.findMany({ orderBy: [{ position: "asc" }, { priceInr: "asc" }] });
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600">
        Used by the package picker in flows ({QUICK_REPLY_LIMIT} buttons max). Phase 5 will sync these from the Red Thread
        site.
      </p>
      {items.map((p) => (
        <Card key={p.id}>
          <details>
            <summary className="cursor-pointer text-sm">
              <span className="font-medium">{p.name}</span> · ₹{p.priceInr.toLocaleString("en-IN")}{" "}
              {!p.active && <Badge>hidden</Badge>}
            </summary>
            <form action={savePackage} className="mt-3 space-y-3">
              <PackageFields item={p} />
              <button className={buttonClass}>Save</button>
            </form>
            <form action={deletePackage} className="mt-2">
              <input type="hidden" name="id" value={p.id} />
              <button className={`${secondaryButtonClass} text-red-700`}>Delete</button>
            </form>
          </details>
        </Card>
      ))}
      <Card>
        <form action={savePackage} className="space-y-3">
          <h2 className="font-medium">Add a package</h2>
          <PackageFields />
          <button className={buttonClass}>Add package</button>
        </form>
      </Card>
    </div>
  );
}

export default function PackagesPage() {
  return (
    <>
      <PageTitle title="Packages" />
      <Suspense fallback={<Loading />}>
        <PackageList />
      </Suspense>
    </>
  );
}
