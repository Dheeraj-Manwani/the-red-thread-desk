import { headers } from "next/headers";
import { isAuthorizedHeader } from "@/lib/auth-header";

/** Call at the top of every server action: proxy coverage alone is not enough. */
export async function requireAdmin() {
  const h = await headers();
  if (!isAuthorizedHeader(h.get("authorization"))) {
    throw new Error("Unauthorized");
  }
}
