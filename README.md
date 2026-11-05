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

> **None of this has been verified against Meta yet.** See [docs/verification.md](docs/verification.md).

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

### Instagram (Instagram API with Instagram login)

1. Webhooks: callback `https://<tunnel>/api/webhooks/instagram`, verify token = `INSTAGRAM_VERIFY_TOKEN`,
   fields `comments`, `messages`, `messaging_postbacks`.
2. Generate a token for the Red Thread account and put it in `INSTAGRAM_ACCESS_TOKEN`. `INSTAGRAM_APP_SECRET` is the
   Instagram app secret shown on the same page.
3. In `/settings`, click "Subscribe to webhooks" on the Instagram card.

### Facebook Page and Messenger

1. Add the Messenger product to the same Meta app.
2. Get a Page token: in Graph API Explorer, get a user token with `pages_show_list`, `pages_manage_metadata`,
   `pages_messaging`, `pages_read_engagement`, `pages_manage_engagement` and `pages_read_user_content`. Exchange it for a
   long-lived token, then `GET /me/accounts` and copy the Page's `access_token` into `FACEBOOK_PAGE_ACCESS_TOKEN`.
3. `FACEBOOK_APP_SECRET` = App settings > Basic > App secret.
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
