import { db } from "@/lib/db";

/**
 * Link-preview crawlers fetch the link as soon as the DM is sent. Don't count them.
 * Instagram's and Facebook's in-app browsers are not matched (their UA has "Instagram" / "FBAN").
 */
const CRAWLER = /facebookexternalhit|meta-externalagent|facebot|whatsapp|twitterbot|slackbot|telegrambot|discordbot|googlebot|bingbot|\bbot\b|crawler|spider|preview/i;

/** Tracked link: logs the click, then redirects to the trigger's link. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const link = await db.shortLink.findUnique({ where: { code } });
  if (!link) return new Response("Link not found", { status: 404 });

  if (!CRAWLER.test(request.headers.get("user-agent") ?? "")) {
    const now = new Date();
    await db.shortLink.update({
      where: { id: link.id },
      data: { clicks: { increment: 1 }, lastClickedAt: now, firstClickedAt: link.firstClickedAt ?? now },
    });
  }
  return Response.redirect(link.url, 302);
}
