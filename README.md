# ColdCall AI Platform

A multi-tenant SaaS platform for insurance agencies to automate outbound cold calls using AI voice agents. Agents upload Excel spreadsheets of contacts, and the system places calls using **ElevenLabs Conversational AI** — a real-time AI voice agent that conducts live conversations. After each call, an LLM analyzes the transcript to extract ratings, summaries, booking status, and lead information.

## Features

- **Multi-tenant architecture** — Each agent operates in isolation with their own credentials, call lists, and dashboards
- **AI-powered voice calls** — ElevenLabs Conversational AI handles live phone conversations using cloned or selected voices
- **Dual telephony support** — Twilio (via ElevenLabs) or DIDWW (direct SIP) per agent
- **Excel upload with validation** — Standardized template with deterministic server-side validation (no LLM)
- **Durable call execution** — Inngest step functions handle sequential call loops with pause/resume/cancel
- **Post-call analysis** — Configurable LLM via Vercel AI Gateway extracts ratings, summaries, emails, names, and booking status from transcripts
- **Role-based dashboards** — Agent dashboard, admin master dashboard, and IT admin credential panel
- **Encrypted credentials** — AES-256-GCM encryption for all API keys stored at rest

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend + API | **Next.js 15** (App Router) |
| Database | **NeonDB** (serverless PostgreSQL) |
| ORM | **Drizzle ORM** (neon-http adapter) |
| Background Jobs | **Inngest** (durable step functions) |
| Voice AI | **ElevenLabs Conversational AI** |
| Telephony | **Twilio** or **DIDWW** (per agent) |
| Post-call Analysis | **Vercel AI Gateway** (configurable model, default: DeepSeek v3.2) |
| Auth | Custom JWT auth with `jose` (httpOnly cookies) |
| UI | **shadcn/ui** + **Tailwind CSS** |
| Validation | **Zod** |

## Project Structure

```
app/
  dashboard/          # Agent pages — call lists, upload, list detail
  admin/              # Agency head pages — master dashboard, agent drill-down
  it-admin/           # IT admin pages — credential management
  login/              # Authentication
  api/
    auth/             # NextAuth handler
    users/            # User CRUD (admin only)
    credentials/      # Credential CRUD + connectivity test
    call-lists/       # Upload, list, detail, start/pause/resume/cancel
    webhooks/         # ElevenLabs post-call webhook
    admin/            # Admin stats, agent listing, billing
    inngest/          # Inngest serve endpoint
    template/         # Excel template download

lib/
  schema.ts           # Drizzle ORM schema (7 tables)
  db.ts               # NeonDB connection
  auth.ts             # NextAuth configuration
  encryption.ts       # AES-256-GCM encrypt/decrypt
  elevenlabs.ts       # Outbound call initiation (Twilio + DIDWW)
  excel-parser.ts     # SheetJS-based template parser
  validators.ts       # Phone normalization + enum validation
  inngest/
    client.ts         # Inngest client with typed events
    execute-calls.ts  # Durable call loop function
    analyze-transcript.ts  # Post-call LLM analysis

components/           # React components (dashboard, forms, cards, badges)
scripts/seed.ts       # Database seed script
schema.sql            # Raw SQL for table creation
```

## Database Schema

7 tables with row-level tenant isolation:

- **users** — Agents, admins, IT admins (with password hash)
- **agent_credentials** — Encrypted ElevenLabs/telephony credentials per agent
- **agent_billing** — Payment tracking and billing cycles
- **call_lists** — Uploaded Excel files with execution status
- **call_entries** — Individual contacts within a list
- **calls** — Call records with post-call analysis results
- **upload_validations** — Upload quality tracking

## User Roles

| Role | Access |
|------|--------|
| **agent** | Own dashboard, upload lists, view call results |
| **admin** | Master dashboard, all agents, billing management |
| **it_admin** | Credential management for all agents |

## Core User Flow

```
Agent sets up ElevenLabs account (voice + script + phone number)
  -> IT admin enters credentials into platform
  -> Agent downloads Excel template
  -> Fills in contacts, uploads to dashboard
  -> System validates (synchronous, no LLM)
  -> Agent presses "Start"
  -> Backend iterates through list via Inngest:
      For each number:
        -> Calls ElevenLabs API (Twilio or DIDWW path)
        -> AI agent has live conversation
        -> ElevenLabs fires webhook with transcript
        -> DeepSeek analyzes transcript
        -> Dashboard updates with results
  -> Agent sees ratings, summaries, booking status
  -> Agency head monitors all agents on master dashboard
```

## Getting Started

### Prerequisites

- Node.js 18+
- A NeonDB database
- ElevenLabs account(s) with Conversational AI configured
- Vercel AI Gateway key (for post-call transcript analysis)
- Inngest account (for background job processing)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy `.env.local.example` or create `.env.local`:

```bash
# NeonDB
DATABASE_URL=postgresql://user:pass@ep-xyz.us-east-2.aws.neon.tech/dbname?sslmode=require

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<random-32-char-string>

# Vercel AI Gateway (post-call transcript analysis)
AI_GATEWAY_BASE_URL=https://gateway.vercel.ai/v1
AI_GATEWAY_API_KEY=vck_...
AI_MODEL=deepseek/deepseek-v3.2

# Encryption key for agent credentials (base64-encoded 32-byte key)
CREDENTIALS_ENCRYPTION_KEY=<base64-key>

# Inngest
INNGEST_EVENT_KEY=<key>
INNGEST_SIGNING_KEY=<key>

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Create database tables

Run the SQL in `schema.sql` against your NeonDB instance, or use Drizzle Kit:

```bash
npx drizzle-kit push
```

### 4. Seed initial users

```bash
npx tsx scripts/seed.ts
```

This creates three users (all with password `admin123`):
- `admin@agency.com` (admin)
- `it@agency.com` (IT admin)
- `agent@agency.com` (agent)

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to the login page.

### 6. Start Inngest dev server (for background jobs)

```bash
npx inngest-cli@latest dev
```

## Deployment

1. Deploy to **Vercel** (`vercel deploy`)
2. Set all environment variables in Vercel dashboard
3. Connect **Inngest** to your Vercel project
4. Configure ElevenLabs webhook URLs to `https://yourdomain.com/api/webhooks/elevenlabs`
5. Point DNS to Vercel

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/[...nextauth]` | NextAuth handler |
| GET/POST | `/api/users` | List / create users (admin) |
| PATCH/DELETE | `/api/users/[id]` | Update / deactivate user (admin) |
| GET/PUT | `/api/credentials/[agentId]` | Get (masked) / upsert credentials |
| POST | `/api/credentials/[agentId]/test` | Test credential connectivity |
| GET | `/api/template/download` | Download Excel template |
| POST | `/api/call-lists/upload` | Upload and validate Excel file |
| GET | `/api/call-lists` | List agent's call lists |
| GET/DELETE | `/api/call-lists/[id]` | Get detail / delete call list |
| POST | `/api/call-lists/[id]/start` | Start calling |
| POST | `/api/call-lists/[id]/pause` | Pause the call loop |
| POST | `/api/call-lists/[id]/resume` | Resume from paused |
| POST | `/api/call-lists/[id]/cancel` | Cancel remaining calls |
| POST | `/api/webhooks/elevenlabs` | ElevenLabs post-call webhook |
| GET | `/api/admin/agents` | All agents with stats (admin) |
| GET | `/api/admin/agents/[id]` | Single agent detail (admin) |
| GET/PATCH | `/api/admin/billing/[agentId]` | Get / update billing (admin) |
| GET | `/api/admin/stats` | Platform-wide aggregates (admin) |

## License

Private — All rights reserved.
