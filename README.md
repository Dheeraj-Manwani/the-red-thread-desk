# Red Thread Autoreply

Comment-to-DM automation for Red Thread on Instagram and Facebook.

- **Phase 1:** per-post comment automations, follow gate (Instagram), tracked links, comment log, STOP/START, token refresh.
- **Phase 2:** Facebook Page comments and Messenger on the same engine, per-post stats, Instagram story replies, ice breakers.
- **Phase 3:** flow builder (React Flow) with buttons/branches, questions, a package picker, tags and conditions.
- **Phase 4:** inbox and contacts for both channels, handoff to you (bot pauses 24 h), PWA with push notifications.
- **Phase 5:** catalogue sync from the Red Thread site, design carousel, Razorpay payment links + webhook, order
  intake, orders Kanban.
- **Phase 6:** WhatsApp Cloud API (Coexistence) in the inbox and flows, DM keyword automations on every channel,
  templates and broadcasts with a cost preview, AI intent for Hinglish with a monthly cap, full dashboard and funnel.

Next up: phases 7–13 (go live, info buttons, content attribution, YouTube Shorts, follow-ups, fulfilment, after-sale)
in [docs/roadmap.md](docs/roadmap.md).

> **None of this has been verified against Meta yet.** See [docs/verification.md](docs/verification.md) for the test
> checklist and [docs/known-issues.md](docs/known-issues.md) for known problems and risks.

## Local setup

```powershell
pnpm install
copy .env.example .env          # then fill in the values
pnpm db:up                      # Postgres in Docker on localhost:5432
pnpm db:migrate                 # creates the tables
pnpm prisma generate            # Prisma 7 no longer generates on migrate
pnpm typecheck
pnpm dev
```

Meta needs a public HTTPS URL for webhooks. Run a tunnel and put its URL in `APP_URL`:

```powershell
cloudflared tunnel --url http://localhost:3000
```

The URL changes on every restart: update `APP_URL` and both callback URLs in Meta each time.

## Meta setup

In Development mode Meta only sends webhooks for people with a role on the app, so add your test accounts as testers.
Real customers need App Review (Advanced Access) and business verification. See `docs/verification.md`.

### Instagram (API setup with Unified login)

New Meta apps can't use "API setup with Instagram login" any more. This app uses a **system-user token** on
`graph.facebook.com` and addresses the Instagram account by its ID. No Facebook Page is needed.

1. Use cases > Instagram API > API setup with Unified login: connect the Red Thread business portfolio.
2. Business Suite > Settings > Accounts > Instagram accounts: make sure the account is listed and copy its ID
   (starts with `1784…`) into `INSTAGRAM_ACCOUNT_ID`. Sign in to Business Suite with Facebook, not Instagram; an
   Instagram login can't open Settings.
3. Business Suite > Settings > Users > System users: give the system user full control of the app and the Instagram
   account, then Generate token (never expires) with `instagram_basic`, `instagram_manage_messages`,
   `instagram_manage_comments`. Put it in `INSTAGRAM_ACCESS_TOKEN`.
4. `META_APP_SECRET` = App settings > Basic > App secret. One secret signs Instagram, Facebook and WhatsApp webhooks.
5. Webhooks (same Unified login page, "Configure webhooks"): callback `https://<tunnel>/api/webhooks/instagram`,
   verify token = `INSTAGRAM_VERIFY_TOKEN`, fields `comments`, `messages`, `messaging_postbacks`.
6. In `/settings`, click "Subscribe to webhooks" on the Instagram card.

### Facebook Page and Messenger

1. Add the Messenger product to the same Meta app. Red Thread's system-user token currently sees no Facebook Page
   (`GET /me/accounts` is empty), so connect or create the Page in the business portfolio first.
2. Get a Page token: in Graph API Explorer, get a user token with `pages_show_list`, `pages_manage_metadata`,
   `pages_messaging`, `pages_read_engagement`, `pages_manage_engagement` and `pages_read_user_content`. Exchange it for a
   long-lived token, then `GET /me/accounts` and copy the Page's `access_token` into `FACEBOOK_PAGE_ACCESS_TOKEN`.
   Untested alternative: assign the Page to the same system user and read `GET /{page-id}?fields=access_token` with
   its token, so one system user covers every channel.
3. Webhooks are signed with `META_APP_SECRET` (same app).
4. Webhooks > Page: callback `https://<tunnel>/api/webhooks/facebook`, verify token = `FACEBOOK_VERIFY_TOKEN` (or the
   Instagram one), fields `feed`, `messages`, `messaging_postbacks`.
5. In `/settings`, click "Subscribe to webhooks" on the Facebook card.

### Razorpay

1. Dashboard > Account & Settings > API keys: put the **test** key ID and secret in `RAZORPAY_KEY_ID` /
   `RAZORPAY_KEY_SECRET` until everything is verified.
2. Dashboard > Webhooks: URL `https://<tunnel>/api/webhooks/razorpay`, a secret of your choice in
   `RAZORPAY_WEBHOOK_SECRET`, events `payment_link.paid`, `payment_link.expired`, `payment_link.cancelled`.

### WhatsApp (Coexistence)

1. Onboard your current WhatsApp Business number to the Cloud API with Coexistence (Meta's Embedded Signup);
   the WhatsApp Business app on your phone keeps working and its sends reach us as echoes.
2. Put the phone number ID, WhatsApp Business Account ID and a system-user token in `.env`.
3. Same Meta app > WhatsApp > Configuration: callback `https://<tunnel>/api/webhooks/whatsapp`, verify token
   `WHATSAPP_VERIFY_TOKEN`, fields `messages`, `message_template_status_update`, `smb_message_echoes`.
4. In `/settings`, click "Subscribe to webhooks" on the WhatsApp card.

### AI intent

Set `ANTHROPIC_API_KEY`. Default model `claude-opus-5-5` at low effort (about ₹0.15 per message); set `AI_MODEL`
to `claude-haiku-5-5` to cut that sharply. `AI_MONTHLY_CAP_USD` stops calls for the month once reached.

### Catalogue

Set `CATALOGUE_URL` to a JSON list of designs on the Red Thread site (`CATALOGUE_TOKEN` if it needs a bearer token).
The field names it understands are listed at the top of `src/lib/catalogue.ts`.

## How it works

Webhook routes verify the signature, save each event, answer 200, then process it with `after()`.

- **Comment** → automation match (post-specific, then all posts, then default) → private reply → either the fixed
  journey (button tap → follow check on Instagram → tracked link) or a **flow**.
- **Story reply** (Instagram) → story automation → DM → follow check → link, or a flow.
- **Ice breaker tap** → reply + link, or a flow.
- **Flows** run step by step and wait on buttons, answers and follow rechecks. After a private reply they pause until the
  person replies, because Meta allows no further messages before that.

Production: Vercel Pro + Neon. Use Neon's pooled connection string as `DATABASE_URL`; run `pnpm db:deploy` on release.
