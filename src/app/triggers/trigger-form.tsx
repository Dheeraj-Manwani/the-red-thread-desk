import { saveTrigger } from "@/app/actions";
import { buttonClass, Card, Field, inputClass } from "@/components/ui";
import { getAccount } from "@/lib/account";
import { instagram } from "@/lib/instagram";
import type { CommentTrigger } from "@/generated/prisma/client";

const defaults = {
  name: "",
  active: true,
  scope: "POSTS",
  mediaIds: [] as string[],
  keywords: ["link", "लिंक", "price", "kitn*", "rate", "details"],
  excludeWords: [] as string[],
  publicReplies: ["Sent you a DM {username} 💌", "Check your DMs {username}!", "Link is in your DMs {username} ✨"],
  dmText: "Hi! Thanks for your comment on Red Thread. Tap below and we'll send you the link.",
  dmButtonText: "Send me the link",
  followGate: true,
  followPromptText: "Follow us first, then tap the button below and the link is yours.",
  followButtonText: "I've followed",
  linkUrl: "",
  linkMessage: "Here's your link:",
  oncePerPerson: true,
  priority: 0,
};

async function loadMedia() {
  try {
    const account = await getAccount();
    const { data } = await instagram.recentMedia(account.accessToken, account.igUserId, 30);
    return { media: data, error: null };
  } catch (error) {
    return { media: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function TriggerForm({ trigger }: { trigger?: CommentTrigger }) {
  const t = trigger ?? defaults;
  const { media, error } = await loadMedia();
  const knownIds = new Set(media.map((m) => m.id));
  const extraIds = t.mediaIds.filter((id) => !knownIds.has(id));

  return (
    <form action={saveTrigger} className="space-y-6">
      {trigger && <input type="hidden" name="id" value={trigger.id} />}

      <Card className="space-y-4">
        <h2 className="font-medium">Basics</h2>
        <Field label="Name">
          <input name="name" defaultValue={t.name} required className={inputClass} placeholder="Wedding reel – Nov" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Applies to" hint="Default runs only on posts with no automation of their own.">
            <select name="scope" defaultValue={t.scope} className={inputClass}>
              <option value="POSTS">Chosen posts or reels</option>
              <option value="ALL_POSTS">All posts</option>
              <option value="DEFAULT">Default (fallback)</option>
            </select>
          </Field>
          <Field label="Priority" hint="Higher wins when two automations match.">
            <input name="priority" type="number" defaultValue={t.priority} className={inputClass} />
          </Field>
          <div className="space-y-2 pt-6 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="active" defaultChecked={t.active} /> Live
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="oncePerPerson" defaultChecked={t.oncePerPerson} /> Once per person per post
            </label>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-medium">Posts and reels</h2>
        {error && <p className="text-sm text-amber-700">Could not load your posts from Instagram: {error}</p>}
        {media.length > 0 && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {media.map((m) => (
              <label key={m.id} className="block cursor-pointer space-y-1 text-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.thumbnail_url ?? m.media_url}
                  alt={m.caption?.slice(0, 60) ?? "Instagram post"}
                  className="aspect-square w-full rounded object-cover"
                />
                <span className="flex items-center gap-1">
                  <input type="checkbox" name="mediaIds" value={m.id} defaultChecked={t.mediaIds.includes(m.id)} />
                  {m.media_product_type === "REELS" ? "Reel" : m.media_type.toLowerCase()} ·{" "}
                  {m.timestamp.slice(0, 10)}
                </span>
              </label>
            ))}
          </div>
        )}
        <Field label="Other post IDs" hint="One per line or comma-separated. Older posts not shown above.">
          <textarea name="extraMediaIds" rows={2} defaultValue={extraIds.join("\n")} className={inputClass} />
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-medium">Keywords</h2>
        <Field
          label="Comment keywords"
          hint="English, Hindi or Hinglish. One per line. kitn* matches kitna, kitne, kitni. Leave empty to reply to every comment."
        >
          <textarea name="keywords" rows={4} defaultValue={t.keywords.join("\n")} className={inputClass} />
        </Field>
        <Field label="Skip comments containing">
          <textarea name="excludeWords" rows={2} defaultValue={t.excludeWords.join("\n")} className={inputClass} />
        </Field>
        <Field label="Public replies" hint="One per line; one is picked at random. {username} becomes @their_handle. Leave empty for no public reply.">
          <textarea name="publicReplies" rows={3} defaultValue={t.publicReplies.join("\n")} className={inputClass} />
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-medium">DM and link</h2>
        <Field label="First DM">
          <textarea name="dmText" rows={3} defaultValue={t.dmText} required className={inputClass} />
        </Field>
        <Field label="DM button" hint="20 characters max.">
          <input name="dmButtonText" defaultValue={t.dmButtonText} maxLength={20} required className={inputClass} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="followGate" defaultChecked={t.followGate} /> Only send the link to followers
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Message to non-followers">
            <textarea name="followPromptText" rows={3} defaultValue={t.followPromptText} required className={inputClass} />
          </Field>
          <Field label="Recheck button" hint="20 characters max.">
            <input name="followButtonText" defaultValue={t.followButtonText} maxLength={20} required className={inputClass} />
          </Field>
        </div>
        <Field label="Link to send" hint="Sent as a tracked short link, so clicks show up per post.">
          <input name="linkUrl" type="url" defaultValue={t.linkUrl} required className={inputClass} placeholder="https://..." />
        </Field>
        <Field label="Text before the link">
          <textarea name="linkMessage" rows={2} defaultValue={t.linkMessage} required className={inputClass} />
        </Field>
      </Card>

      <button className={buttonClass}>Save automation</button>
    </form>
  );
}
