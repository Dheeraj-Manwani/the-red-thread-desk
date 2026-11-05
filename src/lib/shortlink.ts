import { randomBytes } from "node:crypto";
import { db, isUniqueViolation } from "@/lib/db";
import { env } from "@/lib/env";

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function code(length = 7) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function createShortLink(data: {
  url: string;
  contactId?: string;
  triggerId?: string;
  sessionId?: string;
}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const link = await db.shortLink.create({ data: { ...data, code: code() } });
      return { link, href: `${env().APP_URL.replace(/\/$/, "")}/l/${link.code}` };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error("Could not create a unique short link");
}
