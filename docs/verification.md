# Verification checklist

Everything below is **built but not verified against Meta**. Code compiles, lints and builds. Tick items off during live testing.

Tags: [Certain] / [Likely] / [Guessing] = how sure we are the code matches Meta's real behaviour.

## Before any live test

- [ ] Reset the local DB to the squashed `init` migration: `pnpm prisma migrate reset` (Prisma asks for your consent), then `pnpm db:migrate`.
- [ ] Fill `.env`: `INSTAGRAM_APP_SECRET`, `INSTAGRAM_VERIFY_TOKEN`, `INSTAGRAM_ACCESS_TOKEN`, `FACEBOOK_APP_SECRET`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `ADMIN_PASSWORD`.
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
- [ ] Token refresh: `/settings` button, and cron with `CRON_SECRET`.

## Phase 2: Facebook, stats, story replies, ice breakers

- [ ] Page webhook (object `page`) verifies at `/api/webhooks/facebook` and is signed with the Meta app secret. [Likely]
- [ ] Page comment → private reply (Messenger) → tap → link. No follow gate.
- [ ] Facebook public reply via `POST /{comment-id}/comments`.
- [ ] Graph API accepts the `Authorization: Bearer` header on graph.facebook.com. [Likely]. If not, switch to the `access_token` query param in `src/lib/graph.ts`.
- [ ] Instagram story reply arrives with `message.reply_to.story.id` and runs a story automation. [Likely]
- [ ] Ice breakers publish (`me/messenger_profile`) on both channels; a tap arrives as a postback. Instagram needs the `messaging_postbacks` webhook field. [Likely]
- [ ] `/stats` numbers match the comment log; follows gained counts only people who weren't following at the first check.

## Phase 3: Flow builder

- [ ] Build a flow in `/flows`, attach it to an automation, and run it from a comment.
- [ ] After the private reply, the flow pauses until the person replies (the 24 h window isn't open yet). [Certain: Meta rule]
- [ ] Buttons (quick replies, max 13, 20-character titles) branch correctly; typing a button's title also works.
- [ ] Question node stores the answer on the contact and re-asks on invalid input.
- [ ] Package picker lists active packages; the link node can send the chosen package's URL.
- [ ] Tags are added/removed; the condition node branches on tag, field or follower.
- [ ] A flow started from an ice breaker or a story reply can send straight away.

## Before production (not code)

- [ ] Meta **App Review** + Advanced Access for comment and messaging permissions, and **business verification**. Needed for webhooks from people without an app role. [Certain, Meta docs]
- [ ] Switch the app to Live mode.
