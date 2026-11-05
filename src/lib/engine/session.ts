import { getAccount } from "@/lib/account";
import { db } from "@/lib/db";
import { instagram, InstagramApiError } from "@/lib/instagram";
import { env } from "@/lib/env";
import { createShortLink } from "@/lib/shortlink";

export const MAX_FOLLOW_CHECKS = 5;
const RECHECK_DELAY_MS = 3000;

export const payloads = {
  tap: (sessionId: string) => `TAP:${sessionId}`,
  recheck: (sessionId: string) => `RECHECK:${sessionId}`,
  parse(payload: string | undefined) {
    const match = payload?.match(/^(TAP|RECHECK):(.+)$/);
    return match ? { action: match[1] as "TAP" | "RECHECK", sessionId: match[2] } : null;
  },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Loaded = NonNullable<Awaited<ReturnType<typeof loadSession>>>;

function loadSession(id: string) {
  return db.linkSession.findUnique({
    where: { id },
    include: { trigger: true, contact: true, shortLink: true },
  });
}

/** null = we could not check (no consent yet or API error). */
async function checkFollow(token: string, senderId: string): Promise<boolean | null> {
  try {
    const profile = await instagram.userProfile(token, senderId);
    return profile.is_user_follow_business ?? null;
  } catch (error) {
    if (error instanceof InstagramApiError) {
      console.warn("[follow-check]", error.code, error.subcode, error.message);
      return null;
    }
    throw error;
  }
}

async function sendLink(session: Loaded, senderId: string) {
  const account = await getAccount();
  const href = session.shortLink
    ? `${env().APP_URL.replace(/\/$/, "")}/l/${session.shortLink.code}`
    : (
        await createShortLink({
          url: session.trigger.linkUrl,
          contactId: session.contactId,
          triggerId: session.triggerId,
          sessionId: session.id,
        })
      ).href;

  await instagram.sendMessage(account.accessToken, account.igUserId, senderId, `${session.trigger.linkMessage}\n\n${href}`);
  await db.linkSession.update({
    where: { id: session.id },
    data: { status: "LINK_SENT", linkSentAt: new Date() },
  });
}

/**
 * Moves a session forward after the person taps a button or types anything.
 * `senderId` is the ID from the DM webhook, used for all replies.
 */
export async function advanceSession(sessionId: string, senderId: string, action: "TAP" | "RECHECK" | "TEXT") {
  const session = await loadSession(sessionId);
  if (!session || session.contact.optedOut) return "ignored";

  if (session.contact.igsid !== senderId && session.contact.dmIgsid !== senderId) {
    await db.contact.update({ where: { id: session.contactId }, data: { dmIgsid: senderId } }).catch(() => {});
  }

  if (session.status === "LINK_SENT") {
    await sendLink(session, senderId);
    return "link_resent";
  }

  if (!session.trigger.followGate) {
    await sendLink(session, senderId);
    return "link_sent";
  }

  const account = await getAccount();
  let follows = await checkFollow(account.accessToken, senderId);
  if (follows === false && action === "RECHECK") {
    await sleep(RECHECK_DELAY_MS);
    follows = await checkFollow(account.accessToken, senderId);
  }

  if (follows !== null) {
    await db.contact.update({ where: { id: session.contactId }, data: { isFollower: follows } });
  }

  if (follows === true) {
    await sendLink(session, senderId);
    return "link_sent";
  }

  const checks = session.followChecks + 1;
  await db.linkSession.update({
    where: { id: session.id },
    data: { status: "AWAITING_FOLLOW", followChecks: checks },
  });

  const handle = account.username ? `@${account.username}` : "us";
  let text: string;
  if (follows === null) {
    text = `Almost there! Reply "done" here and we'll send it.`;
  } else if (checks === 1) {
    text = session.trigger.followPromptText;
  } else if (checks < MAX_FOLLOW_CHECKS) {
    text = `We can't see the follow yet. Follow ${handle}, then tap the button again.`;
  } else {
    text = `Still not showing as followed. Follow ${handle} and reply here any time to get the link.`;
  }

  const buttons =
    follows === null || checks >= MAX_FOLLOW_CHECKS
      ? undefined
      : [{ title: session.trigger.followButtonText, payload: payloads.recheck(session.id) }];
  await instagram.sendMessage(account.accessToken, account.igUserId, senderId, text, buttons);
  return follows === null ? "consent_needed" : "follow_prompted";
}
