"use client";

import { useEffect, useState, useTransition } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/actions";
import { secondaryButtonClass } from "@/components/ui";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "loading" | "unsupported" | "ios-install" | "off" | "on" | "denied";

/** Turns push notifications on for this browser or installed app. */
export function PushSetup({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [note, setNote] = useState("");
  const [busy, startBusy] = useTransition();

  useEffect(() => {
    (async () => {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState(ios && !standalone ? "ios-install" : "unsupported");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const sub = await reg.pushManager.getSubscription();
      if (Notification.permission === "denied") setState("denied");
      else setState(sub ? "on" : "off");
    })().catch((error) => {
      setState("unsupported");
      setNote(String(error));
    });
  }, []);

  function enable() {
    startBusy(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        await savePushSubscription(sub.toJSON(), navigator.userAgent);
        setState("on");
        setNote("");
      } catch (error) {
        setNote(error instanceof Error ? error.message : String(error));
      }
    });
  }

  function disable() {
    startBusy(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    });
  }

  function test() {
    startBusy(async () => {
      const res = await sendTestPush();
      setNote(res.sent ? `Sent to ${res.sent} device${res.sent === 1 ? "" : "s"}.` : "Nothing sent: no devices, or push isn't configured.");
    });
  }

  return (
    <div className="space-y-2 text-sm">
      {state === "loading" && <p className="text-neutral-500">Checking this browser…</p>}
      {state === "unsupported" && <p className="text-neutral-600">This browser can&apos;t do push notifications.</p>}
      {state === "ios-install" && (
        <p className="text-neutral-600">
          On iPhone, push only works from the installed app: tap Share, then “Add to Home Screen”, open it from there and
          come back to Settings.
        </p>
      )}
      {state === "denied" && (
        <p className="text-amber-700">Notifications are blocked for this site. Allow them in the browser&apos;s site settings.</p>
      )}
      {state === "off" && (
        <button type="button" className={secondaryButtonClass} onClick={enable} disabled={busy}>
          Turn on notifications for this device
        </button>
      )}
      {state === "on" && (
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-green-700">On for this device.</span>
          <button type="button" className={secondaryButtonClass} onClick={test} disabled={busy}>
            Send a test
          </button>
          <button type="button" className={secondaryButtonClass} onClick={disable} disabled={busy}>
            Turn off
          </button>
        </div>
      )}
      {note && <p className="text-xs text-neutral-500">{note}</p>}
    </div>
  );
}
