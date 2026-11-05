import { db } from "@/lib/db";

/** Tracked link: logs the click, then redirects to the trigger's link. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const link = await db.shortLink.findUnique({ where: { code } });
  if (!link) return new Response("Link not found", { status: 404 });

  const now = new Date();
  await db.shortLink.update({
    where: { id: link.id },
    data: { clicks: { increment: 1 }, lastClickedAt: now, firstClickedAt: link.firstClickedAt ?? now },
  });
  return Response.redirect(link.url, 302);
}
