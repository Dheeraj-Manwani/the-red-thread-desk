import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100";
export const buttonClass =
  "inline-flex items-center justify-center rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800";
export const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-100";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-neutral-200 bg-white p-5 ${className}`}>{children}</div>;
}

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

const tones = {
  green: "bg-green-50 text-green-800 border-green-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  red: "bg-red-50 text-red-800 border-red-200",
  grey: "bg-neutral-100 text-neutral-700 border-neutral-200",
} as const;

export function Badge({ tone = "grey", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`inline-block rounded border px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export function Loading() {
  return <p className="text-sm text-neutral-500">Loading…</p>;
}
