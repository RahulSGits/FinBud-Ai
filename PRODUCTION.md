# FinBud — Production Launch Guide

This is everything needed to take FinBud live as a multi-tenant SaaS where
businesses create AI agents that place real phone calls.

## Architecture
```
                 ┌────────────────────────┐
   Browser  ───► │  Next.js app (Vercel)  │  auth, dashboards, billing,
                 │                        │  agent builder, admin, APIs
                 └───────┬────────────────┘
                         │ POST /api/calls/start (Twilio REST)
                         ▼
                   ┌───────────┐   dials    ┌───────────────┐
                   │  Twilio   │ ─────────► │   Caller's     │
                   └─────┬─────┘            │    phone       │
            Media Stream │ (wss)            └───────────────┘
                         ▼
              ┌──────────────────────┐   Deepgram STT ─► OpenAI GPT ─► ElevenLabs/Sarvam TTS
              │  voice-server (Node) │ ◄──────────────────────────────────────────────────►
              │  Render/Railway/Fly  │   (always-on; holds the live call WebSocket)
              └──────────────────────┘
                         │ call ends
                         ▼
        Twilio ─► POST /api/calls/twilio-status ─► log call, deduct credits, notify user
```

Two deployables: the **Next.js app** (serverless OK) and the **voice-server**
(must be always-on — it can't run on Vercel).

## 1. Database → Postgres (required for multi-user)
SQLite is fine for local dev but not production. Switch to Postgres:

1. In `frontend/prisma/schema.prisma`, change the datasource:
   ```prisma
   datasource db { provider = "postgresql" url = env("DATABASE_URL") }
   ```
2. In `frontend/lib/db.ts`, use the standard client (drop the better-sqlite3 adapter):
   ```ts
   import { PrismaClient } from '@prisma/client';
   export const db = globalForPrisma.prisma ?? new PrismaClient();
   ```
3. Set `DATABASE_URL` (Neon, Supabase, or RDS) and run:
   ```bash
   npx prisma migrate deploy   # or: npx prisma db push
   ```

## 2. Provider accounts to create
| Provider | Used for | Where the key goes |
|----------|----------|--------------------|
| **Twilio** | dialing + media streaming | Admin → API Providers (Account SID, Auth Token, From Number) |
| **Deepgram** | speech-to-text | Admin → API Providers |
| **OpenAI** | the agent's brain (GPT) | Admin → API Providers |
| **ElevenLabs** | voice (English/global) | Admin → API Providers |
| **Sarvam** | voice (Hindi/Tamil/Indian) | Admin → API Providers (optional) |
| **Razorpay** | payments / credit top-ups | Admin → API Providers |

All keys are entered once in the **admin panel** and stored AES-256 encrypted.
The voice server fetches them per call over a secured internal endpoint.

## 3. Environment variables
**Next.js app:**
```
DATABASE_URL=postgres://…
JWT_SECRET=<long random>
APP_ENCRYPTION_SECRET=<long random>   # encrypts provider keys
INTERNAL_API_SECRET=<long random>     # shared with the voice server
APP_URL=https://app.yourdomain.com
VOICE_SERVER_URL=https://voice.yourdomain.com
```
**voice-server:** see `voice-server/.env.example` (APP_URL, PUBLIC_HOST,
INTERNAL_API_SECRET must match the app).

## 4. Deploy
1. **App** → Vercel (root `frontend/`). Add the env vars above.
2. **voice-server** → Render/Railway/Fly.io (`npm start`). Note its public host.
3. Point `VOICE_SERVER_URL` (app) and `PUBLIC_HOST` (voice-server) at that host.
4. Buy a Twilio number, enter Twilio creds in the admin panel.

## 5. Go-live checklist
- [ ] Postgres connected, migrations applied
- [ ] Admin account created; all provider keys entered + show "Configured"
- [ ] Razorpay **live** keys added → a real top-up adds credits + generates an invoice
- [ ] voice-server deployed and reachable (`/health` returns ok)
- [ ] Place a test call from the dashboard → agent talks → call logged → credits deducted
- [ ] Set strong `JWT_SECRET`, `APP_ENCRYPTION_SECRET`, `INTERNAL_API_SECRET`

## What's already built and working
Accounts/auth, per-user data isolation, agent builder, billing (Razorpay +
plan→credit allocation + per-call deduction), auto invoices, user/admin
notifications, admin console with encrypted key management, responsive UI,
and the full calling pipeline above. After the steps here + your keys, agents
place real calls.
