"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moveOrderStage } from "@/app/actions";

export type BoardCard = {
  id: string;
  label: string;
  stage: string;
  who: string;
  couple: string | null;
  occasion: string | null;
  title: string;
  amountInr: number;
  paid: boolean;
  eventDate: string | null;
  daysToEvent: number | null;
};

/** Kanban by stage. Drag a card to another column to move it. */
export function Board({ cards, stages }: { cards: BoardCard[]; stages: { id: string; label: string }[] }) {
  const router = useRouter();
  const [, startMove] = useTransition();
  const [over, setOver] = useState<string | null>(null);
  const [optimistic, move] = useOptimistic(cards, (state, { id, stage }: { id: string; stage: string }) =>
    state.map((c) => (c.id === id ? { ...c, stage } : c)),
  );

  function drop(stage: string, id: string) {
    setOver(null);
    const card = optimistic.find((c) => c.id === id);
    if (!card || card.stage === stage) return;
    startMove(async () => {
      move({ id, stage });
      await moveOrderStage(id, stage);
      router.refresh();
    });
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {stages.map((s) => {
        const column = optimistic.filter((c) => c.stage === s.id);
        return (
          <div
            key={s.id}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(s.id);
            }}
            onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
            onDrop={(e) => drop(s.id, e.dataTransfer.getData("text/plain"))}
            className={`w-64 shrink-0 space-y-2 rounded-lg border p-2 ${
              over === s.id ? "border-red-400 bg-red-50" : "border-neutral-200 bg-neutral-100"
            }`}
          >
            <h2 className="px-1 text-sm font-medium text-neutral-700">
              {s.label} <span className="text-neutral-400">{column.length}</span>
            </h2>
            {column.map((c) => (
              <Link
                key={c.id}
                href={`/orders/${c.id}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                className="block space-y-1 rounded-md border border-neutral-200 bg-white p-2 text-xs shadow-sm hover:border-neutral-400"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-neutral-900">{c.couple ?? c.who}</span>
                  {c.paid ? (
                    <span className="rounded bg-green-100 px-1.5 text-green-800">paid</span>
                  ) : (
                    <span className="rounded bg-neutral-100 px-1.5 text-neutral-600">unpaid</span>
                  )}
                </div>
                <p className="text-neutral-600">
                  {c.title} · ₹{c.amountInr.toLocaleString("en-IN")}
                </p>
                <p className="text-neutral-500">
                  {[c.occasion, c.eventDate].filter(Boolean).join(" · ")}
                  {c.daysToEvent !== null && (
                    <span className={c.daysToEvent <= 7 ? " font-medium text-red-700" : ""}>
                      {" "}
                      · {c.daysToEvent >= 0 ? `${c.daysToEvent} d to go` : "event passed"}
                    </span>
                  )}
                </p>
                <p className="text-neutral-400">{c.label}</p>
              </Link>
            ))}
          </div>
        );
      })}
    </div>
  );
}
