import type { Channel } from "@/generated/prisma/client";
import { db, isUniqueViolation } from "@/lib/db";
import { env } from "@/lib/env";
import { facebook } from "@/lib/facebook";
import { instagram } from "@/lib/instagram";
import { whatsapp } from "@/lib/whatsapp";

/** Looks up the account behind a token from .env. */
async function fromEnv(channel: Channel) {
  if (channel === "INSTAGRAM") {
    const token = env().INSTAGRAM_ACCESS_TOKEN;
    if (!token) throw new Error("No Instagram account connected. Set INSTAGRAM_ACCESS_TOKEN.");
    const me = await instagram.me(token);
    return { externalId: me.user_id, username: me.username, accessToken: token };
  }
  if (channel === "WHATSAPP") {
    const { WHATSAPP_ACCESS_TOKEN: token, WHATSAPP_PHONE_NUMBER_ID: phoneId } = env();
    if (!token || !phoneId) {
      throw new Error("No WhatsApp number connected. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.");
    }
    const number = await whatsapp.phoneNumber(token, phoneId);
    return {
      externalId: phoneId,
      username: number.verified_name ?? number.display_phone_number ?? null,
      accessToken: token,
    };
  }
  const token = env().FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error("No Facebook Page connected. Set FACEBOOK_PAGE_ACCESS_TOKEN.");
  const page = await facebook.me(token);
  return { externalId: page.id, username: page.name, accessToken: token };
}

/** The connected account for a channel. Created from the .env token on first use. */
export async function getAccount(channel: Channel) {
  const existing = await db.account.findUnique({ where: { channel } });
  if (existing) return existing;
  const data = await fromEnv(channel);
  try {
    return await db.account.create({ data: { channel, ...data } });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return db.account.findUniqueOrThrow({ where: { channel } });
  }
}

/** Replaces the stored token with the one in .env (after you generate a new one). */
export async function reloadAccountFromEnv(channel: Channel) {
  const data = await fromEnv(channel);
  return db.account.upsert({
    where: { channel },
    create: { channel, ...data },
    update: { ...data, tokenExpiresAt: null },
  });
}

export async function refreshInstagramToken() {
  const account = await getAccount("INSTAGRAM");
  const { accessToken, expiresIn } = await instagram.refreshToken(account.accessToken);
  return db.account.update({
    where: { id: account.id },
    data: { accessToken, tokenExpiresAt: new Date(Date.now() + expiresIn * 1000) },
  });
}
