import { requireAdmin } from "@/lib/auth";
import { getAccount } from "@/lib/account";
import { whatsapp } from "@/lib/whatsapp";

/** Photos and files customers send on WhatsApp. Behind basic auth; streams the file with the token. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new Response("Bad media id", { status: 400 });
  const account = await getAccount("WHATSAPP");
  const info = await whatsapp.mediaInfo(account.accessToken, id);
  const res = await fetch(info.url, { headers: { Authorization: `Bearer ${account.accessToken}` }, cache: "no-store" });
  if (!res.ok || !res.body) return new Response("Media not available", { status: 404 });
  return new Response(res.body, {
    headers: { "Content-Type": info.mime_type, "Cache-Control": "private, max-age=3600" },
  });
}
