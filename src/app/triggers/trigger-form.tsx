import { saveTrigger } from "@/app/actions";
import { buttonClass, Card, Field, inputClass } from "@/components/ui";
import type { Channel, Trigger, TriggerKind } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { aiConfigured, INTENTS, intentLabels } from "@/lib/ai";
import { loadRecentMedia } from "@/lib/media";

const defaults = {
  name: "",
  active: true,
  scope: "POSTS",
  flowId: null as string | null,
  intents: [] as string[],
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

const storyDefaults = {
  ...defaults,
  scope: "ALL_POSTS",
  keywords: [] as string[],
  publicReplies: [] as string[],
  dmText: "Thanks for replying to our story! 💌",
};

export async function TriggerForm({
  trigger,
  channel,
  kind,
}: {
  trigger?: Trigger;
  channel: Channel;
  kind: TriggerKind;
}) {
  const isDm = kind === "DM_KEYWORD";
  // Story replies and DM keywords work the same way: a message, no posts to pick.
  const isStory = kind === "STORY_REPLY" || isDm;
  const isInstagram = channel === "INSTAGRAM";
  const t =
    trigger ?? (isDm ? { ...storyDefaults, dmText: "Thanks for your message! 💌", keywords: ["price", "kitn*", "rate"] } : isStory ? storyDefaults : defaults);
  const [{ items: media, error }, flows] = await Promise.all([
    isStory ? { items: [], error: null } : loadRecentMedia(channel),
    db.flow.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const knownIds = new Set(media.map((m) => m.id));
  const extraIds = t.mediaIds.filter((id) => !knownIds.has(id));
  const thing = isDm ? "message" : isStory ? "story reply" : "comment";
  const ai = aiConfigured();

  return (
    <form action={saveTrigger} className="space-y-6">
      {trigger && <input type="hidden" name="id" value={trigger.id} />}
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="kind" value={kind} />

      <Card className="space-y-4">
        <h2 className="font-medium">Basics</h2>
        <Field label="Name">
          <input
            name="name"
            defaultValue={t.name}
            required
            className={inputClass}
            placeholder={isStory ? "Story replies – Diwali offer" : "Wedding reel – Nov"}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Applies to"
            hint={
              isStory
                ? "Default runs when no other story automation matched."
                : "Default runs only on posts with no automation of their own."
            }
          >
            <select name="scope" defaultValue={t.scope} className={inputClass}>
              {isStory ? (
                <>
                  <option value="ALL_POSTS">{isDm ? "Every DM" : "Every story"}</option>
                  <option value="DEFAULT">Default (fallback)</option>
                </>
              ) : (
                <>
                  <option value="POSTS">Chosen posts or reels</option>
                  <option value="ALL_POSTS">All posts</option>
                  <option value="DEFAULT">Default (fallback)</option>
                </>
              )}
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
              <input type="checkbox" name="oncePerPerson" defaultChecked={t.oncePerPerson} /> Once per person per{" "}
              {isDm ? "automation" : isStory ? "story" : "post"}
            </label>
          </div>
        </div>
      </Card>

      {!isStory && (
        <Card className="space-y-4">
          <h2 className="font-medium">Posts{isInstagram ? " and reels" : ""}</h2>
          {error && <p className="text-sm text-amber-700">Could not load your posts: {error}</p>}
          {media.length > 0 && (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {media.map((m) => (
                <label key={m.id} className="block cursor-pointer space-y-1 text-xs">
                  {m.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.thumbnail}
                      alt={m.caption?.slice(0, 60) ?? "Post"}
                      className="aspect-square w-full rounded object-cover"
                    />
                  ) : (
                    <span className="flex aspect-square w-full items-center overflow-hidden rounded bg-neutral-100 p-2 text-neutral-600">
                      {m.caption?.slice(0, 80) ?? "Text post"}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <input type="checkbox" name="mediaIds" value={m.id} defaultChecked={t.mediaIds.includes(m.id)} />
                    {m.label} · {m.date}
                  </span>
                </label>
              ))}
            </div>
          )}
          <Field label="Other post IDs" hint="One per line or comma-separated. Older posts not shown above.">
            <textarea name="extraMediaIds" rows={2} defaultValue={extraIds.join("\n")} className={inputClass} />
          </Field>
        </Card>
      )}

      <Card className="space-y-4">
        <h2 className="font-medium">Keywords</h2>
        <Field
          label={isDm ? "Message keywords" : isStory ? "Story reply keywords" : "Comment keywords"}
          hint={`English, Hindi or Hinglish. One per line. kitn* matches kitna, kitne, kitni. Leave empty to answer every ${thing}.`}
        >
          <textarea name="keywords" rows={4} defaultValue={t.keywords.join("\n")} className={inputClass} />
        </Field>
        {isDm && (
          <div className="space-y-1 text-sm">
            <span className="font-medium">Also when the AI reads the message as</span>
            <div className="flex flex-wrap gap-3">
              {INTENTS.filter((i) => i !== "human" && i !== "other").map((i) => (
                <label key={i} className="flex items-center gap-1">
                  <input type="checkbox" name="intents" value={i} defaultChecked={t.intents.includes(i)} /> {intentLabels[i]}
                </label>
              ))}
            </div>
            <p className="text-xs text-neutral-500">
              {ai
                ? "Used only when no keyword matched. “Wants a person” always hands off to you."
                : "AI is off: set ANTHROPIC_API_KEY to use intents."}{" "}
              DM keyword automations need at least one keyword or intent; they never answer every message.
            </p>
          </div>
        )}
        <Field label={`Skip ${thing}s containing`}>
          <textarea name="excludeWords" rows={2} defaultValue={t.excludeWords.join("\n")} className={inputClass} />
        </Field>
        {!isStory && (
          <Field
            label="Public replies"
            hint={`One per line; one is picked at random. {username} becomes ${isInstagram ? "@their_handle" : "their name"}. Leave empty for no public reply.`}
          >
            <textarea name="publicReplies" rows={3} defaultValue={t.publicReplies.join("\n")} className={inputClass} />
          </Field>
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="font-medium">What to send</h2>
        <Field
          label="Flow"
          hint="Pick a flow to run it instead of the fixed journey below. With a flow, the First DM is only sent if the flow would otherwise start without a message."
        >
          <select name="flowId" defaultValue={t.flowId ?? ""} className={inputClass}>
            <option value="">None: DM, {isInstagram ? "follow check, " : ""}link</option>
            {flows.map((f) => (
              <option key={f.id} value={f.id}>
                Flow: {f.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="First DM" hint={isStory ? "Sent first, then the link (or the follow prompt)." : undefined}>
          <textarea name="dmText" rows={3} defaultValue={t.dmText} className={inputClass} />
        </Field>
        {!isStory && (
          <Field label="DM button" hint="20 characters max.">
            <input name="dmButtonText" defaultValue={t.dmButtonText} maxLength={20} required className={inputClass} />
          </Field>
        )}
        {isInstagram ? (
          <>
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
          </>
        ) : (
          <p className="text-sm text-neutral-500">Facebook has no follow check, so the link goes to everyone who taps.</p>
        )}
        <Field label="Link to send" hint="Sent as a tracked short link, so clicks show up per post. Not needed with a flow.">
          <input name="linkUrl" type="url" defaultValue={t.linkUrl} className={inputClass} placeholder="https://..." />
        </Field>
        <Field label="Text before the link">
          <textarea name="linkMessage" rows={2} defaultValue={t.linkMessage} required className={inputClass} />
        </Field>
      </Card>

      <button className={buttonClass}>Save automation</button>
    </form>
  );
}
