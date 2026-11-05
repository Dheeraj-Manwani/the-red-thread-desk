import { Suspense } from "react";
import { connection } from "next/server";
import { refreshToken, reloadToken, subscribeWebhooks } from "@/app/actions";
import { Card, Loading, PageTitle, secondaryButtonClass } from "@/components/ui";
import type { Channel } from "@/generated/prisma/client";
import { getAccount } from "@/lib/account";
import { channelLabel } from "@/lib/channels";
import { formatDateTime } from "@/lib/format";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const webhookSetup = {
  INSTAGRAM: {
    path: "/api/webhooks/instagram",
    where: "Instagram > API setup with Instagram login > Webhooks",
    token: "INSTAGRAM_VERIFY_TOKEN",
    fields: "comments, messages, messaging_postbacks",
  },
  FACEBOOK: {
    path: "/api/webhooks/facebook",
    where: "Webhooks > Page (and Messenger > Webhooks for your Page)",
    token: "FACEBOOK_VERIFY_TOKEN (or INSTAGRAM_VERIFY_TOKEN if unset)",
    fields: "feed, messages, messaging_postbacks",
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
            <p className="text-sm text-neutral-600">
              Token expires: {formatDateTime(account.tokenExpiresAt)}
              {!account.tokenExpiresAt && " (unknown until the first refresh)"}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <form action={subscribeWebhooks}>
              <input type="hidden" name="channel" value={channel} />
              <button className={secondaryButtonClass}>Subscribe to webhooks</button>
            </form>
            {channel === "INSTAGRAM" && (
              <form action={refreshToken}>
                <button className={secondaryButtonClass}>Refresh token now</button>
              </form>
            )}
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

const notices: Record<string, (v: string) => string> = {
  subscribed: (v) => `${channelLabel[v as Channel] ?? v} subscribed to webhooks.`,
  reloaded: (v) => `${channelLabel[v as Channel] ?? v} token reloaded from .env.`,
  refreshed: () => "Instagram access token refreshed.",
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
