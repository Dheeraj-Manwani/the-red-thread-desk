"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import type { ScreenHelp } from "@/content/help/types";

// "Opened once" flag per screen, in localStorage. Storage can be missing or blocked
// (private windows, previews), so every access is guarded and failure means "seen": no pulse.
const SEEN_EVENT = "help-seen";
const seenKey = (id: string) => `help-seen:${id}`;

function readSeen(id: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(id)) === "1";
  } catch {
    return true;
  }
}

function markSeen(id: string) {
  try {
    window.localStorage.setItem(seenKey(id), "1");
  } catch {
    // Nothing to remember it in; the pulse just comes back next time.
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(SEEN_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SEEN_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** Round "i" button that opens the screen's help. Pulses until opened once on this browser. */
export function InfoButton({ help }: { help: ScreenHelp }) {
  const seen = useSyncExternalStore(
    subscribe,
    () => readSeen(help.id),
    () => true,
  );

  return (
    <Dialog.Root
      onOpenChange={(open) => {
        if (open) markSeen(help.id);
      }}
    >
      <Dialog.Trigger
        aria-label={`About this screen: ${help.title}`}
        title="About this screen"
        className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-white font-serif text-sm font-semibold text-neutral-600 italic hover:border-red-700 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
      >
        i
        {!seen && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
          </span>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 min-h-dvh bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-neutral-200 bg-white text-neutral-900 shadow-xl transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          <div className="flex items-start gap-3 border-b border-neutral-200 px-5 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold">{help.title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-neutral-600">{help.whatThisIs}</Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="-mt-1 -mr-2 rounded-md px-2 py-1 text-lg leading-none text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            >
              ×
            </Dialog.Close>
          </div>

          <div className="space-y-5 overflow-y-auto overscroll-contain px-5 py-4 text-sm leading-relaxed">
            <Section title="Why it matters">
              <p>{help.whyItMatters}</p>
            </Section>

            <Section title="What to do here">
              <ol className="list-decimal space-y-1 pl-5">
                {help.whatToDo.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </Section>

            <Section title="When to come here">
              <p>{help.whenToCome}</p>
            </Section>

            {help.terms && help.terms.length > 0 && (
              <Section title="Words on this screen">
                <dl className="space-y-2">
                  {help.terms.map((t) => (
                    <div key={t.term}>
                      <dt className="font-medium">{t.term}</dt>
                      <dd className="text-neutral-600">{t.meaning}</dd>
                    </div>
                  ))}
                </dl>
              </Section>
            )}

            {help.mistakes && help.mistakes.length > 0 && (
              <Section title="Watch out for">
                <ul className="list-disc space-y-1 pl-5">
                  {help.mistakes.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </Section>
            )}

            {help.related && help.related.length > 0 && (
              <Section title="Related screens">
                <div className="flex flex-wrap gap-2">
                  {help.related.map((r) => (
                    <Dialog.Close
                      key={r.href}
                      render={<Link href={r.href} />}
                      nativeButton={false}
                      className="rounded-md border border-neutral-300 px-2.5 py-1 text-sm hover:bg-neutral-100"
                    >
                      {r.label}
                    </Dialog.Close>
                  ))}
                </div>
              </Section>
            )}
          </div>

          <div className="border-t border-neutral-200 px-5 py-3 text-xs text-neutral-500">
            New here? The <Dialog.Close render={<Link href="/start" />} nativeButton={false} className="text-red-700 hover:underline">Start here</Dialog.Close> page has the daily routine and every term in one place.
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
