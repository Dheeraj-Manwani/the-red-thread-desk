/** Checks an HTTP basic auth header against ADMIN_USER / ADMIN_PASSWORD. No Next.js imports: used by proxy.ts. */
export function isAuthorizedHeader(header: string | null): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return process.env.NODE_ENV !== "production";
  if (!header?.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const user = process.env.ADMIN_USER ?? "admin";
  return decoded === `${user}:${password}`;
}
