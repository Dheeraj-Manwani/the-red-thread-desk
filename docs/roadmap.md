# Roadmap: phases 7–13

Phases 1–6 built the automation side: comment-to-DM, flows, inbox, orders, WhatsApp, broadcasts, AI intent. The
next phases turn the app into Red Thread's lead platform, with leads coming from **Instagram, Facebook and YouTube
Shorts** and closing on **WhatsApp**.

What we aim for, in one line: **know which video brought paid orders, and never forget anyone who asked for a price.**

Tags as in [known-issues.md](known-issues.md): **[Certain]** confirmed, **[Likely]** probably true, **[Guessing]**
unknown until tested.

## Decisions

| Decision | Why |
|---|---|
| **YouTube data is never polled.** It's fetched only when you press **Refresh YouTube**. No cron, no background job, no push subscription. | Saves API quota. You're in the app when you refresh, so you can review replies before they go out. |
| **YouTube is where leads start, WhatsApp is where they close.** Replies on YouTube send people to WhatsApp with a short code (e.g. `YT42`) that identifies the Short. | YouTube has no DMs. **[Certain]** |
| **Every screen has an "i" button** that opens a modal explaining the screen and what to do there. A new screen isn't finished until its help text is written. | This is your first business. The app should teach as you go. |
| **One person, many channels.** Contacts on different channels with the same phone become one person, with one timeline. | YouTube → WhatsApp handoffs would otherwise count the same lead twice. |
| **Costs are shown before you spend.** YouTube quota, WhatsApp template charges and AI spend appear next to the button that uses them. | Same idea as the broadcast cost preview. |
| **AI drafts, you send** whenever money or a promise is involved (price, discount, delivery date). | Avoids the bot committing you to things. |
| **Not planned:** post scheduling or cross-posting (YouTube Studio and Meta Business Suite do this), multi-tenant SaaS, email marketing. A designer login may come later if you hire. | Keeps the scope on leads and orders. |

## Order and dependencies

```
7  Go live and harden ───────┐
8  Info buttons (can run in parallel with 7)
                             ▼
9  Content, codes, one person record ──► 10 YouTube Shorts
                             │
                             ▼
11 Follow-ups and Today screen ──► 12 Wedding dates and fulfilment ──► 13 After the sale
```

Each phase ends with: typecheck clean, help text written for every new or changed screen,
[verification.md](verification.md) and [known-issues.md](known-issues.md) updated, and a live test of whatever
touches Meta, Google, Razorpay or WhatsApp.

---

## Phase 7: Go live and harden

**Goal:** the six phases already built work with real customers. Three platforms mean more volume, which makes the
existing races worse.

**Build / do**
1. Work through [verification.md](verification.md) with tester accounts on Instagram, Facebook and WhatsApp.
2. **Start Meta App Review and business verification now.** Review takes weeks, and nothing reaches real customers
   until it passes (known issue #1). Record a screencast of each permission in use.
3. Host on Vercel with a fixed domain so webhook URLs stop changing (#28).
4. Fix the races:
   - **#6 Flow double-advance:** lock the flow run while a step is processed (`SELECT … FOR UPDATE` on the run, or a
     Postgres advisory lock keyed on the run ID). A second tap waits, then sees the updated step.
   - **#7 Once-per-person:** claim with a unique row (trigger + contact + post) before sending, using the same
     `INSERT … ON CONFLICT DO NOTHING` pattern as the broadcast claim fix.
   - **#10 Failed webhooks never retried:** keep the raw event; add "Retry" on `/comments` and an automatic retry
     with backoff (3 tries). Retry processing only, not the duplicate check.
   - **#11 Handoff words:** match whole words and short phrases ("talk to a human"), not substrings.
   - **#12 Catch-all story automations:** ignore emoji-only reactions, and warn on save when there are no keywords.
5. Set the AI model after comparing Haiku and Opus on 50 real Hinglish messages (#26).

**Done when:** a tester's comment, DM, WhatsApp chat, payment and order go end to end on the production URL, and
App Review is submitted.

## Phase 8: Info buttons on every screen

**Goal:** every screen explains itself: what it's for, what to do there, and the business terms on it.

**Build**
1. **`InfoButton` + `InfoModal`** in `src/components/`. Use the Base UI Dialog (`@base-ui/react` is already a
   dependency), so Esc, focus trap and screen-reader labels come built in. The modal must read well on a phone (PWA).
2. **`PageTitle` gets a `help` prop** and draws the "i" button next to the title, so every page gets it the same way.
3. **Help content as typed data** in `src/content/help/<screen>.ts`, one file per screen:
   ```ts
   type ScreenHelp = {
     title: string;
     whatThisIs: string;            // one short paragraph
     whyItMatters: string;          // how this screen makes or saves money
     whatToDo: string[];            // numbered steps: the usual job on this screen
     whenToCome: string;            // "every morning", "after posting a reel", "once at setup"
     terms?: { term: string; meaning: string }[];   // 24-hour window, template, opt-in, funnel…
     mistakes?: string[];           // common traps
     related?: { href: string; label: string }[];
   };
   ```
   Plain words, Indian business context, ₹ examples. No jargon left undefined.
4. **First-visit hint:** the "i" button pulses until you've opened it once on that screen (a localStorage flag,
   wrapped in try/catch). It never opens by itself.
5. **`/start` page ("How to run Red Thread here"):** the daily and weekly routine (check Today, reply, post, review
   Content stats), setup order for a new install, and a glossary that collects every `terms` entry.
6. **Check:** a small script (`pnpm check:help`) fails if any `page.tsx` renders `PageTitle` without `help`. Run it
   with typecheck.

**Screens covered now (17):** Dashboard, Inbox, Conversation, Contacts, Orders, Order detail, Broadcasts,
Automations, New automation, Edit automation, Flows, Flow builder, Stats, Comment log, Ice breakers, Packages,
Catalogue, Settings. The flow builder also gets short "i" notes per node type (question, payment, designs…).

**Done when:** every page shows the button, `check:help` passes, and someone new to the business can say what each
screen is for after reading its modal.

## Phase 9: Content, codes and one person record

**Goal:** every lead and order is tied to the video that brought it, across platforms, and each human is one record.

**Data**
- **`Creative`:** one video idea (name, thumbnail, notes, first posted). The same video posted as a Reel, a Facebook
  post and a Short is one creative.
- **`Post`:** one upload on one platform (`channel`, `externalId`, URL, caption, thumbnail, posted at,
  `creativeId?`, `code`). Comments link to it by `mediaId`. Posts are created when their first comment arrives, or
  with an **Import recent posts** button for Instagram and Facebook. Nothing is polled.
- **Codes:** each post gets a short, case-insensitive code (`YT42`, `IG7`, `FB3`, `BIO` for the bio link, `REF-…` in
  phase 13). One code table, so the WhatsApp side resolves all of them the same way.
- **`Person`:** `Contact.personId`. Contacts are merged automatically by phone, and manually from the conversation
  screen ("Same person as…", with unmerge). Replaces the "Also on…" link (#22).
- **Attribution on Person:** first touch and last touch (channel, post, creative, code, time). **Orders copy the
  attribution when they're created**, so later touches don't rewrite past sales.
- **Click-to-WhatsApp ads:** read the `referral` object on inbound WhatsApp messages (ad ID, headline) and store it
  as a touch. **[Likely]** field names; confirm on the first ad.

**Ready-made template sales happen on the site**, not in the app. Links to the site carry the code
(`?ref=YT42`). If the site can put that ref into its Razorpay notes and the app can see those payments (open question
7), site sales count against the creative too; otherwise Content shows clicks to the site for ready-made, and
revenue only for custom orders.

**Code detection on WhatsApp:** before keyword automations run, look for a known code in the first message
("Hi! Code YT42"). If found, record the touch and start that post's flow (or a default "new lead from video" flow).

**Link-in-bio page `/go`** (public, no login): Red Thread name, a few designs from the catalogue, and a **Chat on
WhatsApp** button opening `wa.me/<number>?text=Hi Red Thread! Code <code>`. `/go?c=YT42` carries a post's code
through. Clicks are counted (with the crawler filter from `/l`). This is the one link for the Instagram bio and the
YouTube channel page.

**Screens**
- **Content** (`/content`): creatives with a funnel per creative and per platform: comments → conversations →
  leads → paid orders → ₹ revenue, plus cost per order if you add ad spend. Sort by revenue. The answer to "what
  should I post next?"
- **Creative detail:** its posts side by side, comments, and the people and orders it brought.
- **Person timeline** on the contact and conversation screens: every touch, message, order and payment across
  channels.
- Dashboard: "Best creative this week" and "Leads by platform".

**Done when:** a test lead that comments on Instagram, then messages on WhatsApp with the same phone, shows as one
person, and their paid order counts against the right creative.

## Phase 10: YouTube Shorts (refresh button, no polling)

**Goal:** buying comments on Shorts get a reply that sends people to WhatsApp, with the Short's code attached.

**Setup (start during phase 9: Google takes a while)**
- Google Cloud project, YouTube Data API v3, OAuth client (web), scope `youtube.force-ssl`.
- **Set the OAuth app to "In production".** In "Testing", refresh tokens expire after 7 days. **[Likely]** An
  unverified production app shows a warning screen, which is fine for your own channel.
- `Channel` enum gets `YOUTUBE`. `Account` gets a refresh token and access-token expiry (YouTube access tokens last
  about an hour; refresh on use). Settings gets a **Connect YouTube** card.

**Refresh YouTube** (button on the YouTube screen and on the Dashboard)
1. Fetch new uploads from the channel's uploads playlist since the last refresh and register them as Posts with
   codes.
2. Fetch new comments since the last refresh. Prefer one channel-wide call (`allThreadsRelatedToChannelId`,
   **[Guessing]** that it still works); fall back to per-video calls for Shorts from the last 30 days.
3. Store each as a `Comment` (channel `YOUTUBE`), run the existing matching (keywords + AI intent), and build the
   suggested reply.
4. Show the result: "38 new comments, 9 look like buyers."

**Review and send**
- Matched comments appear in a **review list** with the reply filled in (`{username}`, `{code}`, several wordings
  picked at random so the replies don't look like spam).
- **Send selected** shows the cost first: "9 replies × 50 units = 450 units." You can edit or skip any reply.
- Manual reply to any comment from the same screen.
- An "auto-send on refresh" option for trusted automations, still only when you press Refresh.

**Quota meter:** units used today out of 10,000, last refresh time, and the approximate cost of a refresh (a few
units) and a reply (50). Quota resets at **midnight Pacific time** (12:30 or 1:30 pm IST), so the meter uses that day
boundary. **[Likely]** costs: list calls 1 unit, `comments.insert` 50.

**Reply wording:** links in Shorts comments are probably not clickable (YouTube changed this in 2023;
**[Likely]**), and comments with links or phone numbers can be held for review. So the default reply is: "Thank you!
💌 Prices and samples on WhatsApp: tap the link on our channel page and send code YT42." The channel page link is
`/go`.

**Screens:** **YouTube** (`/youtube`): Refresh button, quota meter, review list, recent Shorts with their codes and
funnel. Automations gains YouTube as a channel for comment automations.

**Test early:** whether links in replies are clickable, whether replies get held, and whether the channel-wide
comments call works.

**Done when:** a comment on a test Short appears after Refresh, gets a reply you approved, and a WhatsApp message with
its code shows up as a lead attributed to that Short.

## Phase 11: Follow-ups and the Today screen

**Goal:** no lead goes quiet without a nudge, and each morning you know exactly whom to talk to.

**Follow-up sequences**
- **`Sequence`:** ordered steps (wait X hours → send a message or a WhatsApp template), with stop rules: paid,
  replied, opted out, handed to you, order cancelled.
- **Start events:** asked the price but no order within N hours; order in LEAD or PAYMENT_SENT unpaid; payment link
  about to expire; flow abandoned halfway.
- **Respects the rules:** inside the 24-hour window, a normal message. Outside it on WhatsApp, an approved template
  and only with opt-in where it's marketing. Outside it on Instagram or Facebook, the bot can't message, so it
  creates a task for you instead.
- Runs on the existing every-minute cron (internal scheduling, not polling any platform), with the same claim-before-
  send pattern as broadcasts so nobody gets a step twice.
- Default sequence shipped ready to edit: 2 h → "Any questions about the designs?", 20 h (before the window closes)
  → samples + price, day 3 → template with an offer to call.

**Lead status:** **Hot / Warm / Cold** from simple, visible rules (asked price recently, shared phone or date, event
within 60 days, replied recently). No hidden scoring.

**Today screen** (`/today`, becomes the home page)
- Replies waiting for you, oldest first.
- **Windows closing:** people whose 24-hour window ends in under 3 hours.
- Hot leads not yet paid; payment links sent and not paid.
- Orders due soon (from the event date), proofs waiting for approval (phase 12).
- One-tap actions on each row: open chat, send payment link, snooze, mark lost (with a reason: price, timing,
  competitor, no reply).

**Morning digest:** a push notification at 9 am IST: "6 replies waiting, 4 hot leads, 2 windows closing."

**Screens:** Today, Sequences (list + editor), lead status and snooze on the conversation screen, "lost" reasons on
Stats.

**Done when:** a test lead that asks the price and goes quiet gets the sequence steps in order, stops getting them
the moment they pay, and shows on Today in between.

## Phase 12: Wedding dates and fulfilment

**Goal:** the event date drives priority, and the work after payment (details, proofs, delivery) happens here instead
of in scattered chats.

**Two kinds of order** (your answer, Nov 2026)
- **Ready-made templates:** fixed price, bought and paid on the Red Thread site (its own Razorpay), delivered
  instantly. The app only sends people there with a tracked link; there's nothing to fulfil here.
- **Custom orders:** priced per requirement, delivered in **3–5 business days** after the details are complete. These
  are the orders this phase manages. Revisions are not counted.

**Custom quote:** an order starts as a LEAD; you enter the quoted amount and a short scope ("names + venue + 3
photos + music") on the order and send the Razorpay link from there. The quote is stored with the order.

**Event date**
- Ask for the date early in the default flows; store it on the person and the order (`eventDate` exists already).
- **Due date** = details complete + delivery time (setting, default 5 business days, Sundays off; adjustable per
  order). The Orders board shows on track / at risk / overdue.
- **Rush warning:** if the event is closer than the delivery time, the order and the Today screen flag it before you
  quote, so you can charge for rush or decline.
- **Calendar** of event and due dates so you can see busy weeks before agreeing to more orders.
- Broadcast filter by event month: "weddings in February, not ordered yet".

**Details form** (`/f/<token>`, public, one per order)
- Replaces long chat question chains: couple and family names, venue, maps link, ceremonies and timings, language,
  photos, music choice.
- Sent automatically after payment; the reminder sequence runs until it's filled.
- Photos go to object storage (Vercel Blob or Cloudflare R2). Fixes expiring CDN links (#23).

**Proofs**
- **`Proof`:** order, version, preview file or link, status (sent / approved / changes requested), customer comment.
- Approval page (`/p/<token>`): customer watches the preview, taps **Approve** or **Request changes** with a note.
- Versions are listed for reference only. No revision limit or count (your call, Nov 2026); easy to add later if
  extra rounds start costing you.

**Delivery:** send the final file on WhatsApp from the order screen, mark delivered, and start phase 13's after-sale
steps.

**Screens:** Calendar, order detail gets Quote, Details, Proofs and Delivery tabs, Settings gets the default delivery
time.

**Done when:** a paid test order moves from payment → form filled → proof v1 → changes → v2 approved → delivered with
no step done outside the app.

## Phase 13: After the sale

**Goal:** turn happy customers into reviews, referrals and repeat orders.

**Build**
- **Review request** N days after delivery (Google review link and/or "send us a video reaction"), with a permission
  checkbox to reuse testimonials in content.
- **Referral codes** per customer (`REF-PRIYA`), recognised in WhatsApp like post codes, attributed as source
  "referral". Track rewards (discount on next order or cash) and mark them given.
- **Next occasion:** anniversary message (event date + 1 year − 3 weeks), and other occasions from `occasion`. Only
  with marketing opt-in, using templates.
- **Saved replies** in the inbox: price list, samples, turnaround, payment steps. Insert with `/` shortcuts.
- **AI-drafted replies** in the inbox: a suggested answer from saved replies and package data that you edit and send.
  Never sent on its own.

**Screens:** Saved replies, Referrals, after-sale settings, review and referral sources on Content and Stats.

**Done when:** a delivered test order gets the review request, its referral code brings a new attributed lead, and
the anniversary message is scheduled.

---

## Screens added by these phases (each needs help text)

| Phase | New screens |
|---|---|
| 8 | Start here (`/start`) |
| 9 | Content, Creative detail, Person timeline, Link-in-bio (`/go`, public: no "i" button) |
| 10 | YouTube |
| 11 | Today, Sequences, Sequence editor |
| 12 | Calendar, Details form and Proof approval (public: no "i" button), order tabs |
| 13 | Saved replies, Referrals |

Public customer-facing pages (`/go`, `/f/…`, `/p/…`) don't get an "i" button; their help lives in the admin screen
that sends them.

## Open questions

| # | Question | Tag | Answered by |
|---|---|---|---|
| 1 | Are links in Shorts comment replies clickable now? | Likely not | Phase 10 test |
| 2 | Does `allThreadsRelatedToChannelId` still return the channel's latest comments? | Guessing | Phase 10 test |
| 3 | Does YouTube hold or hide repeated replies with a code? | Guessing | Phase 10 test |
| 4 | Which object storage: Vercel Blob or Cloudflare R2? | Open | Decide in phase 12 (cost vs simplicity) |
| 5 | ~~Lead time and revisions?~~ Ready-made: instant, on the site. Custom: 3–5 business days, priced per requirement, revisions not tracked. | Answered | You, Nov 2026 |
| 7 | Can the Red Thread site pass a code (`?ref=YT42`) into its Razorpay order notes, and can the app receive those payments (shared Razorpay account webhook)? Without it, ready-made sales can't be attributed to a video. | Open | Check the site's checkout before phase 9 |
| 6 | Referral reward: discount or cash, and how much? | Open | Your business call, before phase 13 |
