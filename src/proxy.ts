import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedHeader } from "@/lib/auth-header";

/**
 * Basic auth on the dashboard. Webhooks, tracked links and cron stay public, and so do the
 * service worker, manifest and icons (browsers fetch those without credentials).
 */
export function proxy(request: NextRequest) {
  if (isAuthorizedHeader(request.headers.get("authorization"))) return NextResponse.next();
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Red Thread Autoreply"' },
  });
}

export const config = {
  matcher: [
    "/((?!api/webhooks|api/cron|l/|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|icons/).*)",
  ],
};
