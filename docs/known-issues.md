# Known issues

Problems and risks found while building phases 1–6. None of this has been verified against Meta, Razorpay or a real
device yet; [verification.md](verification.md) is the test checklist.

Tags: **[Certain]** confirmed (docs or code), **[Likely]** probably true, **[Guessing]** unknown until tested.

## Blockers before real customers

| # | Problem | Tag | What to do |
|---|---|---|---|
| 1 | Meta only sends comment and DM webhooks from people **without a role on your app** once the app is **Live** with **Advanced Access**. That needs App Review, and production needs business verification. The "own accounts only, no App Review" plan covers testing with tester accounts, not customers. Applies to Instagram and Facebook. | Certain (Meta docs) | Test with your second account added as an app tester. Plan App Review + business verification for `instagram_manage_comments`, `instagram_manage_messages` (Unified login / system-user permissions) and the Page / Messenger permissions. |
| 2 | **Coexistence onboarding** (your current WhatsApp number on the Cloud API) runs in Meta's Embedded Signup. Not confirmed that your own app can run it without a BSP. | Likely | Try it from your Meta app first; fall back to a BSP for onboarding only if Meta requires it. |
| 3 | WhatsApp business-initiated messages start at a low daily limit until the business is verified. | Likely | Business verification (same as #1). |
| 4 | The local database still has the old tables. The `init` migration was squashed to the current schema, and Prisma requires your consent to reset. | Certain | Run `pnpm prisma migrate reset` yourself. The DB holds only test data. |

## Bugs and races in the code

| # | Problem | Tag | Where |
|---|---|---|---|
| 5 | ~~**Broadcast double-send**~~ **Fixed.** Overlapping runs (cron + "Send now") could send the same recipients the template again. Now each run claims recipients in one `UPDATE … FOR UPDATE SKIP LOCKED` (PENDING → SENDING) before sending, a broadcast starts only once, and it is marked done only when no claims are in flight. A run that dies mid-send leaves its claims to be failed after 10 minutes, **not resent**: you may need to message those few people by hand. Tested against Postgres with 4 overlapping workers on 120 recipients: each claimed once; the old logic claimed each 4 times. | Certain | `src/lib/broadcasts.ts` (`claim`, `failStaleClaims`, `processBroadcasts`) |
| 6 | **Flow double-advance:** two quick taps or messages from the same person are processed in parallel and can advance the same flow run twice (duplicate messages, skipped step). Nothing locks a run. | Likely | `src/lib/flows/engine.ts` (`resumeFlow`) |
| 7 | **Once-per-person races:** two comments from the same person on the same post seconds apart can both get the DM, because the check and the send aren't atomic. | Likely | `src/lib/engine/comments.ts`, `src/lib/engine/story.ts` |
| 8 | **AI cap can overshoot a little:** the month's spend is checked before each call, so concurrent calls can go slightly past the cap. | Certain | `src/lib/ai.ts` |
| 9 | **Manual-reply detection is timing-based.** An echo whose message ID we haven't logged counts as you typing in the app and pauses the bot for 24 h. The bot's own sends get a 3-second head start. If a log write is slower, the bot pauses itself for that person. | Likely | `src/lib/engine/messages.ts` (`handleEcho`) |
| 10 | **Failed webhook events are never retried.** They show on `/comments` but nothing replays them. Replaying a comment event wouldn't help anyway: the comment row already exists, so it counts as a duplicate. | Certain | `src/lib/engine/process.ts` |
| 11 | **Handoff words match anywhere:** "agent" or "human" anywhere in a message hands the person to you ("travel agent" too). | Likely | `HANDOFF_WORDS` in `src/lib/engine/messages.ts` |
| 12 | **Catch-all story automations** (no keywords) answer every story reply, including emoji reactions. DM keyword automations refuse to save without a keyword or intent; story ones don't. | Likely | `src/lib/engine/story.ts`, `parseTrigger` in `src/app/actions.ts` |

## Unknowns that only a live test answers

| # | Question | Tag | Fallback in the code |
|---|---|---|---|
| 13 | Do Instagram / Messenger **private replies accept quick replies**? | Guessing | Resends as plain text asking them to reply "link" (or the button titles). |
| 14 | Does a quick-reply tap count as **consent for the follow check** (`is_user_follow_business`)? | Guessing | Asks them to reply "done"; gives up after 5 checks. |
| 15 | Does the **commenter ID match the DM sender ID**? | Likely | The person's DM ID is stored from the private reply's `recipient_id` (`Contact.dmId`); button payloads carry the session ID. |
| 16 | ~~Does graph.facebook.com accept the token as an **`Authorization: Bearer` header**?~~ **Yes**: every read call with the Instagram system-user token used the header and returned 200 (Nov 2026). | Certain | n/a |
| 17 | Instagram **story replies** arrive with `message.reply_to.story.id`; ice breakers need the `messaging_postbacks` field. | Likely | n/a |
| 18 | **Generic templates (carousels)** work on Instagram (graph.facebook.com, system-user token). | Likely | Design step skips when no designs; no other fallback. |
| 19 | WhatsApp **Coexistence echoes** arrive on `smb_message_echoes`; **ice breakers** (conversational prompts) arrive as the prompt's text. | Likely | n/a |
| 20 | **Catalogue feed format** of the Red Thread site. | Guessing | The sync accepts many common field names (top of `src/lib/catalogue.ts`). Needs the real URL. |
| 21 | Razorpay `payment_link.*` webhook payload shape matches what the handler reads. | Likely | Order found by link ID, then by `reference_id`. |

## Limits of the design (by choice, for now)

| # | Limit | Tag |
|---|---|---|
| 22 | Contacts on different channels are **linked by phone, not merged**: separate records, an "Also on …" link in the inbox. | Certain |
| 23 | **Photo answers from Instagram / Messenger** are CDN links that can expire. WhatsApp photos are fetched through your login at `/api/whatsapp/media/<id>`. Nothing is copied to storage yet. | Likely |
| 24 | Inbox replies are blocked **outside the 24 h window**. Meta's `HUMAN_AGENT` tag (7 days) needs its own App Review, so it isn't used. | Certain |
| 25 | **WhatsApp rates** in `.env` (₹0.86 marketing, ₹0.115 utility, before 18% GST) are the plan's estimates, not Meta's rate card. The broadcast preview is an upper bound: utility messages inside an open window are free. Spend this month is estimated from broadcasts only. | Likely |
| 26 | **AI model** defaults to `claude-opus-5-5` at low effort (about ₹0.15 per message). `AI_MODEL=claude-haiku-5-5` is much cheaper; untested which classifies Hinglish better. | Likely |
| 27 | **Push notifications** need HTTPS and a VAPID subject (an https `APP_URL` or `VAPID_SUBJECT`). On iPhone they only work from the installed app (iOS 16.4+). | Certain |
| 28 | **Cloudflared tunnel URL changes** on every restart: update `APP_URL` and every webhook callback in Meta and Razorpay each time. | Certain |
| 29 | **Prisma CLI's `latest` npm tag is a pre-release** (8.0.0-rc). The CLI is pinned to 7.10.1 to match the client; don't run `pnpm up prisma --latest`. | Certain |
| 30 | **Neon free tier scales to zero**, so the first webhook after an idle spell is slower. Meta tolerates it, but watch for timeouts. | Likely |
| 31 | Instagram **link-preview crawlers** are filtered from click counts by user agent; a crawler with an unknown UA would still count. | Likely |
