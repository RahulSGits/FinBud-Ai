# Deploying FinBud AI

Two pieces deploy separately:

| Piece | Where | Why |
|---|---|---|
| `web/` — dashboard + API | **Vercel** | Next.js, serverless-friendly |
| `agent/` — voice worker | **LiveKit Cloud**, Railway or Fly | Holds a persistent connection to receive job dispatches; cannot run on serverless |

You only need the worker if you dial through LiveKit. Through OmniDimension the
web app calls their API directly and there is no worker to host.

---

## 1. Database first

Vercel cannot reach a database on your laptop. Create a hosted Postgres before
deploying — the schema needs **no extensions**, so any Postgres works.

Using the Supabase project you already have: **Project Settings → Database →
Connection string**, then take two values:

- **Transaction pooler** URI, port `6543` → `DATABASE_URL`, and append
  `?pgbouncer=true&connection_limit=10&pool_timeout=20`
- **Session pooler** URI, port `5432` → `DIRECT_URL`

Both must be *pooler* hosts. Supabase's direct host (`db.<ref>.supabase.co`)
publishes only an IPv6 address, and Vercel functions have no IPv6 route, so it
can never connect from a deployment however correct the credentials are.

`connection_limit` is not a knob to minimise. Several pages issue a dozen
queries in one `Promise.all`, and Prisma's pool is per-instance: at
`connection_limit=1` those queries serialise behind a single connection and
blow the 10-second pool timeout, which surfaces as "Application error: a
server-side exception" on `/admin`. Measured against this schema, one admin
page load takes ~17s at limit 1, ~6s at 5 and ~4.6s at 10. Ten is comfortable
against Supabase's defaults (pool size 15, 200 max clients) unless you are
running dozens of concurrent instances.

**If the password contains `@`, `#`, `&`, `/`, `?` or `:` it must be
percent-encoded**, or the URL parses wrongly — an `@` in particular splits
userinfo from host, so the driver tries to connect to a nonsense hostname.
Encode with `encodeURIComponent`: `45&Fin@19#bud$99` → `45%26Fin%4019%23bud%2499`.

Then, from your machine, with those values in `web/.env`:

```bash
cd web
npx prisma migrate deploy      # create the tables
node scripts/seed.mjs          # first admin + demo data
npm run db:rls                 # Supabase only: enable row-level security
```

> `scripts/seed.mjs` creates accounts with a known password — fine for a
> staging deploy, wrong for production. For a real launch use
> `node scripts/bootstrap-admin.mjs "you@company.com" "Your Name"` instead,
> which emails an invite and never sets a password.

---

## 2. Vercel project settings

| Setting | Value |
|---|---|
| Root Directory | **`web`** |
| Framework Preset | Next.js |
| Build Command | *(leave default)* — `package.json` already runs `prisma generate && next build` |
| Node version | 20.x |

`prisma generate` **must** run at build time. Vercel caches `node_modules`
between builds, so without it the Prisma client goes stale and queries fail at
runtime with confusing type errors. It is already in the build script — don't
override it.

---

## 3. Environment variables

Set these in **Vercel → Settings → Environment Variables**, for Production
(and Preview if you use it).

### Required — the app will not work without these

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase **transaction pooler** URI, port 6543, `?pgbouncer=true&connection_limit=10&pool_timeout=20` (percent-encode the password) |
| `DIRECT_URL` | Supabase **direct** URI, port 5432 |
| `AUTH_SECRET` | 32+ random bytes. Generate: `openssl rand -hex 32`. **Do not reuse the local one.** Changing it later signs everyone out. |
| `NEXT_PUBLIC_APP_URL` | Your real URL, e.g. `https://finbud.vercel.app`. Used for invite links and provider webhooks, so a wrong value silently breaks both. |

### Calling mode

| Variable | Value |
|---|---|
| `USE_MOCK_CALLS` | `true` until you have a phone number. **Leave it `true` for the first deploy** — `false` with a working provider dials real people. |

### Voice provider — whichever you actually use

**OmniDimension** (simplest: they sell +91 numbers directly, no SIP trunk needed)

| Variable | Value |
|---|---|
| `OMNIDIM_API_KEY` | from your OmniDimension dashboard |
| `VOICE_PROVIDER` | `omnidimension` |

**LiveKit** (more control, needs a SIP trunk)

| Variable | Value |
|---|---|
| `LIVEKIT_URL` | `wss://…livekit.cloud` |
| `LIVEKIT_API_KEY` | |
| `LIVEKIT_API_SECRET` | |
| `LIVEKIT_SIP_TRUNK_ID` | **`ST_…`** from `lk sip outbound create`. A SIP *hostname* (`sip:….livekit.cloud`) is not a trunk id and will not dial. |
| `LIVEKIT_AGENT_NAME` | `finbud-agent` — must match `agent_name` in `agent/src/agent.py` |
| `FINBUD_INTERNAL_SECRET` | `openssl rand -hex 32`. Must be **identical** in the worker's env, or its `/api/internal/*` calls get 403. |
| `VOICE_PROVIDER` | `livekit` |

### Optional — each degrades gracefully

| Variable | Enables | Without it |
|---|---|---|
| `OPENAI_API_KEY` | AI agent authoring, Enhance, knowledge embeddings, call analysis | Those features report themselves unavailable; documents still store their text |
| `PROMPT_AI_MODEL` | override, default `gpt-4o-mini` | — |
| `RESEND_API_KEY` | emailed invitations | The app hands the admin a copyable invite link instead |
| `RESEND_FROM` | sender, e.g. `FinBud <noreply@yourdomain.com>` | Falls back to Resend's shared sender |
| `CRON_SECRET` | authenticates the campaign cron | Cron requests are rejected; campaigns only advance while a dashboard is open |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp sending | Messages are simulated and recorded, never delivered |
| `WHATSAPP_ACCESS_TOKEN` | " | " |
| `WHATSAPP_VERIFY_TOKEN` | Meta webhook handshake — any string you choose, entered identically in Meta | Delivery receipts never arrive |
| `NEXT_PUBLIC_SUPABASE_URL` | only if you call Supabase APIs directly | Unused by the app itself |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | " | " |

Anything starting `NEXT_PUBLIC_` is **shipped to the browser**. Never put a
secret behind that prefix.

---

## 4. Cron

Campaign pacing comes from two schedulers, because Vercel's Hobby plan rejects
any cron more frequent than daily:

- **GitHub Actions** (`.github/workflows/campaign-tick.yml`) ticks every ~5
  minutes and does the real work. Configure two repository secrets under
  **Settings → Secrets and variables → Actions**: `APP_URL`
  (e.g. `https://finbud-call-ai.vercel.app`) and `CRON_SECRET` (the same value
  as the Vercel env var).
- **Vercel Cron** fires once daily at 09:00 IST as a safety net, via the
  `crons` entry in `vercel.json`. Vercel sends `GET` with
  `Authorization: Bearer $CRON_SECRET`; the route accepts that alongside the
  `x-cron-secret` header other schedulers use. On the Pro plan you can tighten
  its schedule back to `*/5 * * * *` and retire the workflow.

Set `CRON_SECRET` in both places or ticks are rejected with 401 — the workflow
fails loudly in the Actions tab when the two values disagree. The dashboard
also ticks while anyone has it open, so a missing scheduler slows campaigns
rather than breaking them.

---

## 5. The voice worker (LiveKit only)

```bash
cd agent
lk agent create      # register
lk agent deploy      # ship
```

Its environment needs `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
`FINBUD_API_URL` (your deployed Vercel URL) and `FINBUD_INTERNAL_SECRET`
(matching the web app exactly).

---

## 6. Before real customers

- **Rotate every key** that has been pasted into a chat, terminal or commit.
- **Turn off `USE_MOCK_CALLS`** only once you have a number and have placed one
  test call to yourself.
- **DND scrubbing** against the TRAI registry. The `do_not_call` status is
  enforced for both calls and WhatsApp, but nothing syncs it with the national
  registry.
- **Recording consent** — the schema stores `recordingUrl`; Indian law requires
  disclosure.
- **WhatsApp templates** must be pre-approved by Meta for business-initiated
  messages. Free-text only works inside a 24-hour reply window.
- **Backups** — enable point-in-time recovery on Supabase.
