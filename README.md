# FinBud AI

AI voice calling platform for Finance Buddha, built on
[LiveKit Agents](https://docs.livekit.io/agents/).

```
FinBud-Ai/
├── agent/          Python worker — runs the live voice pipeline
└── web/            Next.js dashboard, API and database
```

## Architecture

Unlike a managed provider (Vapi, OmniDimension), the voice pipeline runs in
**our own worker process**. LiveKit handles media transport, SIP telephony and
model routing; we own turn-taking, prompts, analysis and persistence.

```
Customer phone
      │  PSTN
      ▼
LiveKit SIP  ──────────────►  LiveKit room
                                   │  job dispatch (metadata: callLogId, agentId…)
                                   ▼
                            agent worker  (agent/)
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
      GET /api/internal/    STT → LLM → TTS      POST /api/internal/
        agent-config        (LiveKit Inference)     call-report
              │                                          │
              └──────────────►  web/  ◄─────────────────┘
                                (Next.js + Postgres)
```

The worker is **stateless**: each job fetches its agent configuration from the
web API using identifiers passed in room metadata, so agents authored in the
dashboard drive live calls without redeploying the worker.

### Why a worker at all

LiveKit agents register with the server and receive job dispatches over a
persistent connection. That cannot run on Vercel functions — the worker needs
an always-on host (LiveKit Cloud, Railway, Fly.io). The Next.js app can still
deploy to Vercel.

### The provider abstraction

Nothing above `web/lib/providers` knows which vendor executes a call. Adding an
engine means writing one adapter that implements `VoiceProvider` and registering
it. Three ship today: `livekit`, `omnidimension`, and `mock`.

**Mock mode is the default.** With `USE_MOCK_CALLS=true` every provider resolves
to the built-in simulator, which drives the full lifecycle (ringing → in progress
→ transcript → summary → lead outcome) through the same database writes the real
worker performs. Campaigns, dashboards and analytics all work end to end with no
telephony and no model spend.

## Roles

Two roles, no organisation table — this is a single-company deployment.

| | Employee | Admin |
|---|---|---|
| AI agents | authors their own; may use any active agent | all |
| Campaigns | their own, over their own leads | all |
| Contacts | those assigned to them | all |
| Calls | on their leads, or that they started | all |
| Knowledge base | read | read + upload + delete |
| Team, Settings, Analytics | — | ✓ |

The rule: **an employee may _use_ anything the company has published, but may
only _change_ what they created.** It is enforced in one place —
`web/lib/authz.ts` — which every page and route handler imports rather than
re-deriving its own filter.

There is no public sign-up. Accounts exist only because an admin created or
invited them.

## Quick start

```bash
cd web
npm install
cp .env.example .env      # then fill in AUTH_SECRET at minimum
npm run pg:start          # local PostgreSQL, no Docker or Homebrew needed
npm run db:migrate
npm run db:seed
npm run dev
```

`db:seed` prints the demo sign-in credentials: one admin and two employees, with
an agent, a campaign and eight contacts ready to dial in mock mode.

### Database

The schema needs **no Postgres extensions**, so it applies unchanged to a local
cluster, Docker, or Supabase. To use Supabase instead of the local server, set
both URLs in `.env` from Project Settings → Database → Connection string — the
pooled URI (port 6543, `?pgbouncer=true`) for `DATABASE_URL` and the direct URI
(port 5432) for `DIRECT_URL` — then run `npm run db:migrate`.

| Script | Purpose |
|---|---|
| `npm run pg:start` / `pg:stop` / `pg:status` | local PostgreSQL for development |
| `npm run db:migrate` | apply migrations |
| `npm run db:seed` | demo accounts and data |
| `npm run db:studio` | Prisma Studio |
| `npm run db:rls` | enable row-level security on every table (Supabase) |
| `npm run setup` | generate + migrate + seed in one step |

## Going live

Mock mode is on by default so nothing dials a real person by accident. To place
real calls:

1. Authenticate and configure LiveKit:
   ```bash
   lk cloud auth
   cd agent && lk app env -w .env.local
   ```
2. Create an **outbound SIP trunk** and put its id in `LIVEKIT_SIP_TRUNK_ID`:
   ```bash
   lk sip outbound create
   ```
   The id looks like `ST_xxxxxxxxxxxx`. A SIP *hostname*
   (`sip:….sip.livekit.cloud`) is not a trunk id and will not dial.
3. Set `FINBUD_INTERNAL_SECRET` to the same value in `web/.env` and
   `agent/.env.local` — the worker's calls to `/api/internal/*` are rejected
   otherwise.
4. Set `USE_MOCK_CALLS=false`.
5. Run the worker:
   ```bash
   cd agent
   uv sync
   uv run python src/agent.py console   # talk to it in your terminal
   uv run python src/agent.py dev       # connect to LiveKit, wait for dispatch
   ```
6. Deploy it: `lk agent create`, then `lk agent deploy`.

The campaign runner is tick-based and restart-safe — all state lives in the
database. Point a scheduler at `POST /api/campaigns/tick` with the `x-cron-secret`
header for unattended dialling; the dashboard also ticks while it is open.

## Optional integrations

Each degrades gracefully: the feature reports itself unavailable and the rest of
the app is unaffected.

| Variable | Enables |
|---|---|
| `OPENAI_API_KEY` | "describe your agent and go" authoring, per-section Enhance, knowledge-base embeddings |
| `RESEND_API_KEY` | emailed invitations — without it the app hands the admin a copyable invite link instead of claiming an email was sent |
| `CRON_SECRET` | unattended campaign ticking |
| `OMNIDIM_API_KEY` | OmniDimension as an alternative voice engine |

## Layout

| Path | Purpose |
|---|---|
| `agent/src/agent.py` | worker entrypoint and session setup |
| `agent/src/finbud/config.py` | agent config fetch, prompt assembly, job metadata |
| `agent/src/finbud/reporting.py` | transcript capture, LLM analysis, result delivery |
| `web/lib/authz.ts` | who can see and change what |
| `web/lib/providers/` | voice engine abstraction and adapters |
| `web/lib/campaigns/runner.ts` | tick-based bulk calling engine |
| `web/lib/livekit/report.ts` | the single place a finished call is persisted |
| `web/lib/knowledge/` | document extraction, chunking, embedding, retrieval |

## Tests

```bash
cd web   && npm run typecheck
cd agent && uv run pytest        # needs Python 3.10+
```

The Python suite covers prompt assembly, job-metadata parsing, transcript
formatting and the call-analysis short-circuits — no API keys or network
required.
