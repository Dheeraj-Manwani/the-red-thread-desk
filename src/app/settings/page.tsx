import { Suspense } from "react";
import { connection } from "next/server";
import { refreshToken, subscribeWebhooks } from "@/app/actions";
import { Card, Loading, PageTitle, secondaryButtonClass } from "@/components/ui";
import { getAccount } from "@/lib/account";
import { formatDateTime } from "@/lib/format";

async function AccountCard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const sp = await searchParams;
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

  let account: Awaited<ReturnType<typeof getAccount>> | null = null;
  let error: string | null = null;
  try {
    account = await getAccount();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-4">
      {sp.subscribed && <p className="text-sm text-green-700">Webhooks subscribed for comments and messages.</p>}
      {sp.refreshed && <p className="text-sm text-green-700">Access token refreshed.</p>}

      <Card className="space-y-2">
        <h2 className="font-medium">Instagram account</h2>
        {account ? (
          <>
            <p className="text-sm">
              @{account.username} · ID {account.igUserId}
            </p>
            <p className="text-sm text-neutral-600">Token expires: {formatDateTime(account.tokenExpiresAt)} (unknown until the first refresh)</p>
            <div className="flex flex-wrap gap-2 pt-2">
              <form action={subscribeWebhooks}>
                <button className={secondaryButtonClass}>Subscribe this account to webhooks</button>
              </form>
              <form action={refreshToken}>
                <button className={secondaryButtonClass}>Refresh token now</button>
              </form>
            </div>
          </>
        ) : (
          <p className="text-sm text-red-700">{error}</p>
        )}
      </Card>

      <Card className="space-y-2 text-sm">
        <h2 className="font-medium">Webhook settings for the Meta app dashboard</h2>
        <p>
          Callback URL: <code className="rounded bg-neutral-100 px-1">{appUrl}/api/webhooks/instagram</code>
        </p>
        <p>Verify token: the value of INSTAGRAM_VERIFY_TOKEN in your .env</p>
        <p>Fields to subscribe: comments, messages</p>
      </Card>
    </div>
  );
}

export default function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <>
      <PageTitle title="Settings" />
      <Suspense fallback={<Loading />}>
        <AccountCard searchParams={searchParams} />
      </Suspense>
    </>
  );
}
