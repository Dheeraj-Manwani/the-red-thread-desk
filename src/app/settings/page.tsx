import { Suspense } from "react";
import { connection } from "next/server";
import { reloadToken, subscribeWebhooks } from "@/app/actions";
import { Card, Loading, PageTitle, secondaryButtonClass } from "@/components/ui";
import type { Channel } from "@/generated/prisma/client";
import { getAccount } from "@/lib/account";
import { channelLabel } from "@/lib/channels";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { pushStatus } from "@/lib/push";
import { razorpayConfigured } from "@/lib/razorpay";
import { aiConfigured, aiSpendThisMonth } from "@/lib/ai";
import { PushSetup } from "@/app/settings/push-setup";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const webhookSetup = {
  INSTAGRAM: {
    path: "/api/webhooks/instagram",
    where: "Use cases > Instagram API > API setup with Unified login > Configure webhooks",
    token: "INSTAGRAM_VERIFY_TOKEN",
    fields: "comments, messages, messaging_postbacks",
  },
  FACEBOOK: {
    path: "/api/webhooks/facebook",
    where: "Webhooks > Page (and Messenger > Webhooks for your Page)",
    token: "FACEBOOK_VERIFY_TOKEN (or INSTAGRAM_VERIFY_TOKEN if unset)",
    fields: "feed, messages, messaging_postbacks, message_echoes",
  },
  WHATSAPP: {
    path: "/api/webhooks/whatsapp",
    where: "WhatsApp > Configuration > Webhook (same Meta app)",
    token: "WHATSAPP_VERIFY_TOKEN (or INSTAGRAM_VERIFY_TOKEN if unset)",
    fields: "messages, message_template_status_update, smb_message_echoes (Coexistence)",
  },
} as const;

async function AccountCard({ channel, appUrl }: { channel: Channel; appUrl: string }) {
  let account: Awaited<ReturnType<typeof getAccount>> | null = null;
  let error: string | null = null;
  try {
    account = await getAccount(channel);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const setup = webhookSetup[channel];

  return (
    <Card className="space-y-3">
      <h2 className="font-medium">{channelLabel[channel]}</h2>
      {account ? (
        <>
          <p className="text-sm">
            {channel === "INSTAGRAM" ? `@${account.username}` : account.username} · ID {account.externalId}
          </p>
          {channel === "INSTAGRAM" && (
            <p className="text-sm text-neutral-600">System-user token: it doesn&apos;t expire.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <form action={subscribeWebhooks}>
              <input type="hidden" name="channel" value={channel} />
              <button className={secondaryButtonClass}>Subscribe to webhooks</button>
            </form>
            <form action={reloadToken}>
              <input type="hidden" name="channel" value={channel} />
              <button className={secondaryButtonClass}>Use token from .env</button>
            </form>
          </div>
        </>
      ) : (
        <p className="text-sm text-red-700">{error}</p>
      )}
      <div className="space-y-1 border-t border-neutral-100 pt-3 text-sm text-neutral-700">
        <p>
          Callback URL: <code className="rounded bg-neutral-100 px-1">{appUrl + setup.path}</code>
        </p>
        <p>Where: {setup.where}</p>
        <p>Verify token: {setup.token} from your .env</p>
        <p>Fields: {setup.fields}</p>
      </div>
    </Card>
  );
}

async function AiCard() {
  const on = aiConfigured();
  const spend = on ? await aiSpendThisMonth() : null;
  const e = env();
  return (
    <Card className="space-y-2 text-sm">
      <h2 className="font-medium">AI intent (Hinglish)</h2>
      {on && spend ? (
        <>
          <p>
            Model {e.AI_MODEL} · this month ${spend.costUsd.toFixed(2)} of ${e.AI_MONTHLY_CAP_USD} cap over {spend.calls}{" "}
            messages
            {spend.costUsd >= e.AI_MONTHLY_CAP_USD && <span className="text-red-700"> · cap reached, AI paused</span>}
          </p>
          <p className="text-neutral-600">
            Runs only on DMs no keyword or waiting flow handled. Change the model with AI_MODEL and the cap with
            AI_MONTHLY_CAP_USD.
          </p>
        </>
      ) : (
        <p className="text-amber-700">Off. Set ANTHROPIC_API_KEY to turn it on.</p>
      )}
    </Card>
  );
}

function SalesCard({ appUrl }: { appUrl: string }) {
  const keys = razorpayConfigured();
  const test = process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_");
  const webhook = Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);
  const catalogue = Boolean(process.env.CATALOGUE_URL);
  return (
    <Card className="space-y-2 text-sm">
      <h2 className="font-medium">Razorpay and catalogue</h2>
      <p>
        API keys: {keys ? (test ? "set (test mode)" : "set (live mode)") : <span className="text-amber-700">not set</span>}
      </p>
      <p>Webhook secret: {webhook ? "set" : <span className="text-amber-700">not set (payments won&apos;t be confirmed)</span>}</p>
      <p>
        Webhook URL: <code className="rounded bg-neutral-100 px-1">{appUrl}/api/webhooks/razorpay</code>, events
        payment_link.paid, payment_link.expired, payment_link.cancelled
      </p>
      <p>Catalogue feed: {catalogue ? "set" : <span className="text-amber-700">CATALOGUE_URL not set</span>}</p>
    </Card>
  );
}

async function NotificationsCard() {
  let problem: string | null;
  let publicKey: string | undefined;
  try {
    problem = pushStatus();
    publicKey = env().VAPID_PUBLIC_KEY;
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }
  const devices = await db.pushSubscription.count();
  return (
    <Card className="space-y-3">
      <h2 className="font-medium">Notifications</h2>
      <p className="text-sm text-neutral-600">
        Get a push when someone asks for you, replies while the bot is paused, or sends a message no automation handles.
        Install this app on your phone (Add to Home Screen) for the best results. {devices} device
        {devices === 1 ? "" : "s"} subscribed.
      </p>
      {problem || !publicKey ? (
        <p className="text-sm text-amber-700">{problem ?? "Push isn't configured."}</p>
      ) : (
        <PushSetup publicKey={publicKey} />
      )}
    </Card>
  );
}

const notices: Record<string, (v: string) => string> = {
  subscribed: (v) => `${channelLabel[v as Channel] ?? v} subscribed to webhooks.`,
  reloaded: (v) => `${channelLabel[v as Channel] ?? v} token reloaded from .env.`,
};

async function Accounts({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return (
    <div className="space-y-4">
      {Object.entries(notices).map(([key, text]) =>
        typeof sp[key] === "string" ? (
          <p key={key} className="text-sm text-green-700">
            {text(sp[key])}
          </p>
        ) : null,
      )}
      <AccountCard channel="INSTAGRAM" appUrl={appUrl} />
      <AccountCard channel="FACEBOOK" appUrl={appUrl} />
      <AccountCard channel="WHATSAPP" appUrl={appUrl} />
      <SalesCard appUrl={appUrl} />
      <AiCard />
      <NotificationsCard />
    </div>
  );
}

export default function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageTitle title="Settings" />
      <Suspense fallback={<Loading />}>
        <Accounts searchParams={searchParams} />
      </Suspense>
    </>
  );
}
