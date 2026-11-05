import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { instagram } from "@/lib/instagram";

/** The connected account. Created from INSTAGRAM_ACCESS_TOKEN on first use. */
export async function getAccount() {
  const existing = await db.instagramAccount.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;

  const token = env().INSTAGRAM_ACCESS_TOKEN;
  if (!token) throw new Error("No Instagram account connected. Set INSTAGRAM_ACCESS_TOKEN.");
  const me = await instagram.me(token);
  return db.instagramAccount.create({
    data: { igUserId: me.user_id, username: me.username, accessToken: token },
  });
}

export async function refreshAccountToken() {
  const account = await getAccount();
  const { accessToken, expiresIn } = await instagram.refreshToken(account.accessToken);
  return db.instagramAccount.update({
    where: { id: account.id },
    data: { accessToken, tokenExpiresAt: new Date(Date.now() + expiresIn * 1000) },
  });
}
