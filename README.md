# Red Thread Autoreply

Comment-to-DM automation for Red Thread (Instagram first). Phase 1: per-post comment automations,
follow gate, tracked links, comment log.

## Local setup

```powershell
pnpm remove cn @prisma/adapter-neon @neondatabase/serverless
pnpm add @prisma/adapter-pg pg dotenv
pnpm add -D prisma @types/pg
copy .env.example .env          # then fill in the values
pnpm db:up                      # Postgres in Docker on localhost:5432
pnpm db:migrate --name init     # creates the tables
pnpm prisma generate            # Prisma 7 no longer generates on migrate
pnpm typecheck
pnpm dev
```

Meta needs a public HTTPS URL for webhooks. Run a tunnel and put its URL in `APP_URL`:

```powershell
cloudflared tunnel --url http://localhost:3000
```

Then in the Meta app dashboard (developers.facebook.com > your app > Instagram > API setup with Instagram login):

1. Webhooks: callback `https://<tunnel>/api/webhooks/instagram`, verify token = `INSTAGRAM_VERIFY_TOKEN`, subscribe to `comments` and `messages`.
2. Generate a token for the Red Thread account and put it in `INSTAGRAM_ACCESS_TOKEN`.
3. Open `/settings` in the app and click "Subscribe this account to webhooks".
4. Create an automation in `/triggers`, then comment on that post from another account.

## How it works

`/api/webhooks/instagram` verifies the signature, saves each event, answers 200, then processes it with `after()`.
Comment → trigger match (post-specific, then all-posts, then default) → private DM with a quick reply →
tap → follow check (`is_user_follow_business`) → tracked link `/l/<code>` → redirect.

Production: Vercel Pro + Neon. Use Neon's pooled connection string as `DATABASE_URL`; run `pnpm db:deploy` on release.
