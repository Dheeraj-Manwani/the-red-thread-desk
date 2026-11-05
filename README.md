# Red Thread Autoreply

Comment-to-DM automation for Red Thread on Instagram and Facebook.

- **Phase 1:** per-post comment automations, follow gate (Instagram), tracked links, comment log, STOP/START, token refresh.
- **Phase 2:** Facebook Page comments and Messenger on the same engine, per-post stats, Instagram story replies, ice breakers.
- **Phase 3:** flow builder (React Flow) with buttons/branches, questions, a package picker, tags and conditions.

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

## How it works

Webhook routes verify the signature, save each event, answer 200, then process it with `after()`.

- **Comment** → automation match (post-specific, then all posts, then default) → private reply → either the fixed
  journey (button tap → follow check on Instagram → tracked link) or a **flow**.
- **Story reply** (Instagram) → story automation → DM → follow check → link, or a flow.
- **Ice breaker tap** → reply + link, or a flow.
- **Flows** run step by step and wait on buttons, answers and follow rechecks. After a private reply they pause until the
  person replies, because Meta allows no further messages before that.

Production: Vercel Pro + Neon. Use Neon's pooled connection string as `DATABASE_URL`; run `pnpm db:deploy` on release.
