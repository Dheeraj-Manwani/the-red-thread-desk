# Verification checklist

Everything below is **built but not verified against Meta**. Code compiles, lints and builds. Tick items off during live testing.

Tags: [Certain] / [Likely] / [Guessing] = how sure we are the code matches Meta's real behaviour.
Known problems and risks, including code races to fix: [known-issues.md](known-issues.md).

## Before any live test

- [ ] Reset the local DB to the squashed `init` migration: `pnpm prisma migrate reset` (Prisma asks for your consent), then `pnpm db:migrate`.
- [ ] Fill `.env`: `META_APP_SECRET`, `INSTAGRAM_VERIFY_TOKEN`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_ACCOUNT_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `ADMIN_PASSWORD`.
- [ ] Add your second Instagram / Facebook account as a **tester** on the Meta app. In Development mode Meta only sends webhooks for people with a role on the app. [Certain, Meta docs]
- [ ] `cloudflared tunnel --url http://localhost:3000`, put the URL in `APP_URL`, restart `pnpm dev`.

## Phase 1: Instagram comment → DM → follow → link

- [ ] Webhook verification (GET) succeeds in the Meta dashboard.
- [ ] A comment webhook arrives and shows in `/comments`.
- [ ] Private reply is delivered. **Does it accept quick replies?** If not, the text fallback is sent ("Reply link"). [Guessing]
- [ ] `recipient_id` from the private reply matches the DM sender ID (Contact.dmId gets set if not). [Likely]
- [ ] Public reply posts under the comment.
- [ ] Tapping the button gives consent for the follow check (`is_user_follow_business`). If not, the "reply done" path runs. [Guessing]
- [ ] Non-follower → follow prompt → follow → recheck → link.
- [ ] Short link redirects and counts a click; the link-preview crawler is not counted.
- [ ] STOP / START (exact message only).
- [ ] Instagram token: system-user token, no refresh needed. `/settings` shows the account (@theredthreadcards).

## Phase 2: Facebook, stats, story replies, ice breakers

- [ ] Page webhook (object `page`) verifies at `/api/webhooks/facebook` and is signed with the Meta app secret. [Likely]
- [ ] Page comment → private reply (Messenger) → tap → link. No follow gate.
- [ ] Facebook public reply via `POST /{comment-id}/comments`.
- [x] Graph API accepts the `Authorization: Bearer` header on graph.facebook.com. [Certain: verified with the Instagram system-user token]
- [ ] Instagram story reply arrives with `message.reply_to.story.id` and runs a story automation. [Likely]
- [ ] Ice breakers publish (Instagram: `/{ig-id}/messenger_profile`, Facebook: `me/messenger_profile` with the Page token) on both channels; a tap arrives as a postback. Instagram needs the `messaging_postbacks` webhook field. [Likely]
- [ ] `/stats` numbers match the comment log; follows gained counts only people who weren't following at the first check.

## Phase 3: Flow builder

- [ ] Build a flow in `/flows`, attach it to an automation, and run it from a comment.
- [ ] After the private reply, the flow pauses until the person replies (the 24 h window isn't open yet). [Certain: Meta rule]
- [ ] Buttons (quick replies, max 13, 20-character titles) branch correctly; typing a button's title also works.
- [ ] Question node stores the answer on the contact and re-asks on invalid input.
- [ ] Package picker lists active packages; the link node can send the chosen package's URL.
- [ ] Tags are added/removed; the condition node branches on tag, field or follower.
- [ ] A flow started from an ice breaker or a story reply can send straight away.

## Phase 4: Inbox, contacts, handoff, push

- [ ] Every DM in and out shows in `/inbox/[id]`: the person, Bot, You (inbox), You (app).
- [ ] Our own API sends come back as echoes and are **not** shown twice (deduped by `mid`, 3 s head start). [Likely]
- [ ] Messenger echoes arrive once `message_echoes` is subscribed (Facebook card in Settings). Instagram sends echoes on `messages`. [Likely]
- [ ] Replying by hand in the Instagram / Messenger app pauses the bot for 24 h (echo with an unknown `mid`). [Likely]
- [ ] "human" / "agent" / "baat karni hai" etc. → ack message, bot paused, "wants you" badge, urgent push.
- [ ] While paused: comments are logged with skip reason `handoff` (no DM), and DMs only notify.
- [ ] Inbox reply works inside 24 h and is blocked after (Meta's standard window; no HUMAN_AGENT tag). [Certain: Meta rule]
- [ ] Facebook reply goes to the PSID learnt from the private reply (`Contact.dmId`). [Likely]
- [ ] "Hand off to me" flow step ends the flow, pauses the bot, notifies.
- [ ] Push: turn on in Settings over **https** (the tunnel), get the test push, tap opens the conversation. Needs `VAPID_SUBJECT` or an https `APP_URL`.
- [ ] iPhone: push only after "Add to Home Screen" (iOS 16.4+). [Certain, Next.js PWA guide]
- [ ] Service worker, manifest and icons load without the basic-auth prompt.
- [ ] Unread badge clears when a thread is opened; the inbox refreshes every 8 s.

## Phase 5: Sales

- [ ] **Catalogue feed format is a guess.** Point `CATALOGUE_URL` at the Red Thread site's designs JSON; `src/lib/catalogue.ts` lists the field names it accepts. [Guessing] Sync from `/catalogue`, then the daily cron.
- [ ] Design carousel (generic template) renders on Instagram and Messenger with Preview and Buy; Buy arrives as a postback. [Likely]
- [ ] Carousel images load (Meta fetches `image_url`; it must be public https).
- [ ] Razorpay test keys (`rzp_test_`): a flow's Payment link step creates an order and a link; the link opens and pays in test mode.
- [ ] Webhook at `/api/webhooks/razorpay` with `payment_link.paid / expired / cancelled`; signature check passes; a retry with the same `x-razorpay-event-id` is ignored.
- [ ] Paid → order Paid, urgent push, the flow continues on "paid" (detail questions fill the order); outside 24 h the thank-you is skipped.
- [ ] Inbox "Send payment link" (package or custom amount) and order page "New link" / "Mark paid".
- [ ] Orders board: drag between stages sticks after refresh; list view; days-to-event.
- [ ] Photo answers: Instagram/Messenger attachment URLs are CDN links that may expire. [Likely]. Copy photos you need.
- [ ] Revenue shows on the dashboard and per post in `/stats` (flow-started orders only).

## Phase 6: WhatsApp, broadcasts, AI intent, dashboard

- [ ] **Coexistence onboarding** of your current WhatsApp Business number (Meta's Embedded Signup flow; your phone app keeps working). Then `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, a system-user `WHATSAPP_ACCESS_TOKEN`. [Likely]: confirm your own app can run Coexistence signup without a BSP.
- [ ] Webhook `/api/webhooks/whatsapp` verifies; fields `messages`, `message_template_status_update`, `smb_message_echoes`; signed with the Meta app secret (`META_APP_SECRET`). [Likely]
- [ ] Inbound text, button and list replies reach flows; ≤3 choices = reply buttons, 4–10 = list menu; designs = list with preview links.
- [ ] Replies you type in the WhatsApp Business app arrive as `smb_message_echoes` and pause the bot. [Likely]
- [ ] WhatsApp photos open through `/api/whatsapp/media/<id>` (needs your login).
- [ ] WhatsApp "ice breakers" = conversational prompts; a tap arrives as the prompt text. [Likely]
- [ ] Same phone across channels shows "Also on …" in the inbox (a link, not a merge).
- [ ] DM keyword automations on IG, Messenger and WhatsApp; catch-all (no keyword, no intent) is refused on save.
- [ ] Opt-in flow step sets consent; STOP clears it; broadcasts go only to opted-in WhatsApp contacts.
- [ ] Template submit → PENDING → APPROVED by webhook; "Sync from WhatsApp" matches Meta.
- [ ] Broadcast review shows count × rate × 1.18; send-now runs right away, the every-minute cron continues; delivered/read/failed update from statuses. Rates in `.env` are estimates [Likely]: check Meta's India rate card.
- [ ] AI intent: set `ANTHROPIC_API_KEY`; Hinglish samples ("kitne ka hai", "designs dikhao", "mera invite kab milega", "kisi se baat karni hai") land on the right intent; cost logs in Settings; the cap stops calls.
- [ ] Dashboard today/7-day numbers, handoffs, closing windows, top posts, spend; Stats funnel and revenue by channel.

## Before production (not code)

- [ ] Meta **App Review** + Advanced Access for comment and messaging permissions, and **business verification**. Needed for webhooks from people without an app role. [Certain, Meta docs]
- [ ] Switch the app to Live mode.
