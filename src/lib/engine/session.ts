import { getClient, type ChannelClient } from "@/lib/channels";
import { db } from "@/lib/db";
import { rememberDmId } from "@/lib/engine/contacts";
import { payloads } from "@/lib/engine/payloads";
import { env } from "@/lib/env";
import { createShortLink } from "@/lib/shortlink";

export const MAX_FOLLOW_CHECKS = 5;
const RECHECK_DELAY_MS = 3000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Loaded = NonNullable<Awaited<ReturnType<typeof loadSession>>>;

function loadSession(id: string) {
  return db.linkSession.findUnique({
    where: { id },
    include: { trigger: true, contact: true, shortLink: true },
  });
}

async function sendLink(
  client: ChannelClient,
  session: Loaded,
  senderId: string,
  follow: { initialFollower?: boolean | null; followGained?: boolean } = {},
) {
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

  await client.sendMessage(senderId, `${session.trigger.linkMessage}\n\n${href}`);
  await db.linkSession.update({
    where: { id: session.id },
    data: { status: "LINK_SENT", linkSentAt: session.linkSentAt ?? new Date(), ...follow },
  });
}

/**
 * Moves a session forward after the person taps a button or types anything.
 * `senderId` is the ID from the DM webhook, used for all replies.
 */
export async function advanceSession(sessionId: string, senderId: string, action: "TAP" | "RECHECK" | "TEXT") {
  const session = await loadSession(sessionId);
  if (!session || session.contact.optedOut) return "ignored";
  const client = await getClient(session.channel);

  await rememberDmId(session.contact, senderId);

  if (session.status === "LINK_SENT") {
    await sendLink(client, session, senderId);
    return "link_resent";
  }

  // Facebook has no follow check, so the gate never applies there.
  if (!session.trigger.followGate || !client.canCheckFollow) {
    await sendLink(client, session, senderId);
    return "link_sent";
  }

  let follows = await client.checkFollow(senderId);
  if (follows === false && action === "RECHECK") {
    await sleep(RECHECK_DELAY_MS);
    follows = await client.checkFollow(senderId);
  }

  if (follows !== null) {
    await db.contact.update({ where: { id: session.contactId }, data: { isFollower: follows } });
  }
  const initialFollower = session.initialFollower ?? follows;

  if (follows === true) {
    await sendLink(client, session, senderId, { initialFollower, followGained: initialFollower === false });
    return "link_sent";
  }

  const checks = session.followChecks + 1;
  await db.linkSession.update({
    where: { id: session.id },
    data: { status: "AWAITING_FOLLOW", followChecks: checks, initialFollower },
  });

  // Stop answering once we've asked enough times; the person can still reach us by hand.
  if (checks > MAX_FOLLOW_CHECKS) return "gave_up";

  const handle = client.username ? `@${client.username}` : "us";
  let text: string;
  if (follows === null) {
    text =
      checks < MAX_FOLLOW_CHECKS
        ? `Almost there! Reply "done" here and we'll send it.`
        : `We couldn't confirm the follow automatically. We'll check and send the link by hand.`;
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
  await client.sendMessage(senderId, text, buttons);
  return follows === null ? "consent_needed" : "follow_prompted";
}
