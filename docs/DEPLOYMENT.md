# Production Deployment Guide

This guide covers deploying RealtorAI to production on Vercel with Supabase, Upstash Redis, Stripe, Anthropic, and Resend.

---

## Architecture Overview

```
                        ┌──────────────┐
                        │   Vercel     │
                        │  (Next.js)   │
                        │  App + API   │
                        └──────┬───────┘
                               │
          ┌────────────┬───────┼────────┬──────────────┐
          │            │       │        │              │
   ┌──────▼──────┐ ┌───▼───┐ ┌▼──────┐ ┌▼────────┐ ┌──▼─────┐
   │  Supabase   │ │Upstash│ │Stripe │ │Anthropic│ │ Resend │
   │ (Postgres + │ │(Redis)│ │       │ │ (Claude) │ │(Email) │
   │  Auth + S3) │ │       │ │       │ │         │ │        │
   └─────────────┘ └───────┘ └───────┘ └─────────┘ └────────┘

          ┌──────────────────┐
          │  BullMQ Worker   │
          │  (separate proc) │
          │  ← Redis ←       │
          └──────────────────┘
```

**Components:**

| Component | Purpose |
|---|---|
| **Vercel** | Hosts Next.js app, serverless API routes, cron jobs |
| **Supabase** | PostgreSQL database, authentication, file storage |
| **Upstash Redis** | Rate limiting (serverless REST), used by API routes |
| **Redis (standard)** | BullMQ job queue for background workers |
| **Stripe** | Subscription billing, webhooks |
| **Anthropic** | Claude AI for compliance checks, document analysis |
| **Resend** | Transactional emails (notifications, alerts) |
| **BullMQ Worker** | Separate long-running process for async jobs |

---

## Prerequisites

- Node.js 20 (see `.nvmrc`)
- A [Supabase](https://supabase.com) project
- An [Upstash](https://upstash.com) Redis database
- A [Stripe](https://stripe.com) account with test/live keys
- An [Anthropic](https://console.anthropic.com) API key
- A [Resend](https://resend.com) account
- A [Vercel](https://vercel.com) account
- A persistent Redis instance for BullMQ workers (Redis Cloud, Railway, or self-hosted)

---

## Step 1: Supabase Setup

### 1.1 Create Project

Create a new Supabase project at [supabase.com/dashboard](https://supabase.com/dashboard). Note your:
- **Project URL** (`NEXT_PUBLIC_SUPABASE_URL`)
- **Anon Key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- **Service Role Key** (`SUPABASE_SERVICE_ROLE_KEY`)

### 1.2 Run Migrations

Apply the database migrations in order. From the Supabase SQL Editor or using the CLI:

```bash
# If using Supabase CLI linked to your project:
supabase db push
```

Or manually run each migration file from `supabase/migrations/` in order:

1. `00001_initial_schema.sql` — Core tables (organizations, profiles, memberships, documents, compliance checks, AI usage, detection results, detection errors, etc.)
2. `00002_add_file_hash_and_fix_bucket.sql` — File hash column, storage bucket
3. `00003_add_credits.sql` — AI credit/quota system
4. `00004_add_missed_signature_error_type.sql` — Detection error type + signature tracking
5. `00005_add_anomaly_flags.sql` — Anomaly detection tables

### 1.3 Storage Bucket

Migration `00002` creates a `documents` storage bucket. Verify it exists in Supabase Dashboard > Storage. Ensure RLS policies allow authenticated uploads.

### 1.4 Auth Configuration

In Supabase Dashboard > Authentication > URL Configuration:
- **Site URL**: Set to your production URL (e.g. `https://app.realtorai.com`)
- **Redirect URLs**: Add `https://app.realtorai.com/callback`

---

## Step 2: Upstash Redis Setup

### 2.1 Create Database

Create a Redis database at [console.upstash.com](https://console.upstash.com). Note your:
- **REST URL** (`UPSTASH_REDIS_REST_URL`)
- **REST Token** (`UPSTASH_REDIS_REST_TOKEN`)

This is used for serverless rate limiting in API routes (compatible with Vercel's edge/serverless environment).

### 2.2 Standard Redis for Workers

BullMQ workers require a persistent Redis connection (not REST). Options:
- **Upstash** (with standard Redis connection string)
- **Redis Cloud** (free tier available)
- **Railway** / **Render** Redis add-on
- **Self-hosted** Redis 7+

Set this as `REDIS_URL` (e.g. `redis://default:password@host:6379`).

---

## Step 3: Stripe Setup

### 3.1 API Keys

From [Stripe Dashboard > Developers > API Keys](https://dashboard.stripe.com/apikeys):
- **Secret Key** (`STRIPE_SECRET_KEY`) — use `sk_live_...` for production
- **Publishable Key** (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) — use `pk_live_...`

### 3.2 Create Products & Prices

Create three subscription products with monthly recurring prices in Stripe. Set the price IDs as:
- `STRIPE_PRICE_SOLO`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_TEAM`

### 3.3 Webhook

Create a webhook endpoint in Stripe Dashboard > Developers > Webhooks:
- **Endpoint URL**: `https://app.realtorai.com/api/webhooks/stripe`
- **Events to listen for**:
  - `checkout.session.completed`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

Copy the **Signing Secret** as `STRIPE_WEBHOOK_SECRET`.

---

## Step 4: External Services

### 4.1 Anthropic

Get your API key from [console.anthropic.com](https://console.anthropic.com) and set `ANTHROPIC_API_KEY`.

Optional model overrides:
```
AI_MODEL_FAST=claude-haiku-4-5-20251001
AI_MODEL_STANDARD=claude-sonnet-4-6
AI_MODEL_PREMIUM=claude-opus-4-6
```

Set a spend ceiling to prevent runaway costs:
```
AI_SYSTEM_MONTHLY_CEILING_CENTS=50000   # $500/month
AI_SYSTEM_ADMIN_EMAIL=admin@yourco.com
```

### 4.2 Resend

Get your API key from [resend.com/api-keys](https://resend.com/api-keys) and set:
- `RESEND_API_KEY`
- `FROM_EMAIL` — must be a verified domain in Resend (e.g. `noreply@realtorai.com`)

---

## Step 5: Vercel Deployment

### 5.1 Connect Repository

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the GitHub repository
3. Framework preset: **Next.js** (auto-detected)
4. Root directory: `.` (default)
5. Build command: `npm run build` (default)
6. Node.js version: **20.x**

### 5.2 Environment Variables

Add all environment variables in Vercel Dashboard > Project Settings > Environment Variables.

**Required:**

| Variable | Example | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://abc.supabase.co` | From Supabase dashboard |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Server-only, keep secret |
| `NEXT_PUBLIC_APP_URL` | `https://app.realtorai.com` | Your production URL |
| `STRIPE_SECRET_KEY` | `sk_live_...` | Live Stripe key |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | Client-side Stripe key |
| `STRIPE_PRICE_SOLO` | `price_...` | Stripe price ID |
| `STRIPE_PRICE_PRO` | `price_...` | Stripe price ID |
| `STRIPE_PRICE_TEAM` | `price_...` | Stripe price ID |
| `UPSTASH_REDIS_REST_URL` | `https://...upstash.io` | Upstash REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | `AX...` | Upstash REST token |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Anthropic API key |
| `RESEND_API_KEY` | `re_...` | Resend API key |
| `FROM_EMAIL` | `noreply@realtorai.com` | Verified sender address |
| `CRON_SECRET` | (generate a random string) | Secures cron endpoints |

**Optional:**

| Variable | Default | Notes |
|---|---|---|
| `AI_ENABLED` | `true` | Set `false` to disable AI |
| `AI_MODEL_FAST` | `claude-haiku-4-5-20251001` | Fast-tier model |
| `AI_MODEL_STANDARD` | `claude-sonnet-4-6` | Standard-tier model |
| `AI_MODEL_PREMIUM` | `claude-opus-4-6` | Premium-tier model |
| `AI_SYSTEM_MONTHLY_CEILING_CENTS` | `0` (disabled) | Monthly AI spend cap |
| `AI_SYSTEM_ADMIN_EMAIL` | — | Email for spend alerts |
| `ANOMALY_LARGE_FILE_BYTES` | `5242880` | 5 MB threshold |
| `ANOMALY_LARGE_UPLOAD_LIMIT` | `20` | Max large uploads/period |
| `ANOMALY_DUPLICATE_UPLOAD_LIMIT` | `5` | Max duplicate uploads |
| `ANOMALY_AI_SPIKE_ABSOLUTE` | `50` | AI call spike threshold |
| `ANOMALY_AI_SPIKE_MULTIPLIER` | `3` | Relative spike multiplier |

### 5.3 Cron Jobs

The `vercel.json` configures a monthly cron job:

| Schedule | Endpoint | Purpose |
|---|---|---|
| `0 0 1 * *` (1st of month, midnight UTC) | `/api/cron/reset-credits` | Resets AI credit quotas |

Vercel Cron is enabled automatically. Ensure the endpoint validates `CRON_SECRET` via the `Authorization` header.

### 5.4 Deploy

```bash
# Push to main to trigger auto-deploy, or:
vercel --prod
```

---

## Step 6: BullMQ Worker Deployment

The BullMQ worker is a **separate long-running process** that must run outside of Vercel (Vercel only supports serverless functions).

### Hosting Options

| Platform | How |
|---|---|
| **Railway** | Add as a separate service, set start command |
| **Render** | Background worker service |
| **Fly.io** | Dockerfile or process group |
| **AWS ECS / EC2** | Docker container or PM2 |
| **Self-hosted** | PM2 or systemd service |

### Start Command

```bash
npm run worker
# Equivalent to: npx tsx worker.ts
```

### Required Environment Variables

The worker process needs:

```
REDIS_URL=redis://user:password@host:6379
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=...
RESEND_API_KEY=...
FROM_EMAIL=...
AI_ENABLED=true
```

### Worker Queues

| Queue | Concurrency | Purpose |
|---|---|---|
| `document-review` | 3 | Text extraction + AI document analysis |
| `compliance-check` | 5 | Compliance check routing and execution |
| `fair-housing` | 5 | Fair housing language analysis |
| `notification` | 10 | Email and in-app notifications |
| `billing-sync` | 2 | Stripe billing synchronization |

### Graceful Shutdown

The worker handles `SIGTERM` and `SIGINT` — it waits for in-flight jobs to complete before exiting. Ensure your hosting platform sends SIGTERM and allows a grace period (30s recommended).

---

## Step 7: CI/CD Pipeline

GitHub Actions runs automatically on pushes and PRs to `main`.

### Pipeline Stages

```
Push to main
    │
    ▼
┌─────────┐    ┌───────────────────┐
│   CI    │───▶│  Regression Gate  │
│         │    │  (main only)      │
└─────────┘    └───────────────────┘
    │                   │
    │  • tsc            │  • Triggers AI accuracy
    │  • lint           │    evaluation suite
    │  • build          │  • Blocks deploy if F1
    │                   │    drops below threshold
    ▼                   ▼
              Vercel auto-deploy
```

### GitHub Secrets Required

Add these in GitHub > Repository Settings > Secrets and variables > Actions:

| Secret | Purpose |
|---|---|
| `REGRESSION_GATE_URL` | Full URL to regression gate endpoint |
| `REGRESSION_GATE_API_KEY` | API key for authentication |
| `REGRESSION_GATE_ORG_ID` | Organization ID for test suite |

### Regression Gate Thresholds

Configured in `.github/workflows/ci.yml`:
- **F1 Drop Threshold**: `0.05` — max allowed F1 score regression
- **Minimum F1**: `0.7` — absolute minimum F1 score to pass

---

## Step 8: Post-Deployment Verification

### 8.1 Smoke Tests

Run these checks after deployment:

```bash
# Health check — app loads
curl -s -o /dev/null -w "%{http_code}" https://app.realtorai.com

# API auth — should return 401
curl -s https://app.realtorai.com/api/admin/ai-analytics | jq .error.code

# Cron endpoint — should require auth
curl -s https://app.realtorai.com/api/cron/reset-credits | jq .
```

### 8.2 Functional Checklist

- [ ] User can sign up and log in
- [ ] Organization creation works
- [ ] Document upload succeeds and triggers background processing
- [ ] Compliance check returns AI-generated results
- [ ] Fair housing check flags violations
- [ ] Stripe checkout redirects correctly
- [ ] Webhook processes subscription events
- [ ] Admin pages load (AI Analytics, Audit Log, Anomaly Flags, Compliance Tracker)
- [ ] CSV and PDF exports download correctly
- [ ] Email notifications arrive via Resend
- [ ] Credit reset cron fires on schedule (test manually first)

### 8.3 Monitor Worker

```bash
# Check worker logs on your hosting platform
# All queues should show "connected" on startup:
# [Worker] Connected to Redis
# [Worker] All workers started:
#   - document-review (concurrency: 3)
#   - compliance-check (concurrency: 5)
#   - fair-housing (concurrency: 5)
#   - notification (concurrency: 10)
#   - billing-sync (concurrency: 2)
```

---

## Rollback Procedure

### Application Rollback

```bash
# Vercel instant rollback to previous deployment
vercel rollback

# Or via dashboard: Vercel > Deployments > select previous > Promote to Production
```

### Database Rollback

Migrations are forward-only. For emergencies:
1. Take a Supabase backup before any migration
2. Restore from backup via Supabase dashboard
3. Re-deploy the matching application commit

---

## Security Checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is **never** exposed to the client (no `NEXT_PUBLIC_` prefix)
- [ ] `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are server-only
- [ ] `ANTHROPIC_API_KEY` is server-only
- [ ] All admin API routes check `memberships` for `admin` or `owner` role
- [ ] Stripe webhook endpoint validates signature via `STRIPE_WEBHOOK_SECRET`
- [ ] Cron endpoints validate `CRON_SECRET`
- [ ] Rate limiting is active on AI and upload endpoints (Upstash)
- [ ] RLS policies are enabled on all Supabase tables
- [ ] `AI_SYSTEM_MONTHLY_CEILING_CENTS` is set to prevent runaway AI costs
- [ ] File uploads are restricted to allowed MIME types (`pdf`, `doc`, `docx`, `txt`) and 10 MB max

---

## Environment Variable Reference

Full list sourced from `.env.example` and codebase:

```bash
# ── Supabase ──
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# ── App ──
NEXT_PUBLIC_APP_URL=

# ── Stripe ──
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRICE_SOLO=
STRIPE_PRICE_PRO=
STRIPE_PRICE_TEAM=

# ── Redis / Upstash ──
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
REDIS_URL=

# ── Anthropic AI ──
ANTHROPIC_API_KEY=
AI_ENABLED=true
# AI_MODEL_FAST=
# AI_MODEL_STANDARD=
# AI_MODEL_PREMIUM=
# AI_MODEL_FALLBACK=
# AI_SYSTEM_MONTHLY_CEILING_CENTS=0
# AI_SYSTEM_ADMIN_EMAIL=

# ── Resend ──
RESEND_API_KEY=
FROM_EMAIL=noreply@realtorai.com

# ── Cron ──
CRON_SECRET=

# ── Regression Gate (CI only) ──
REGRESSION_GATE_URL=
REGRESSION_GATE_API_KEY=
REGRESSION_GATE_ORG_ID=

# ── Anomaly Detection (optional tuning) ──
# ANOMALY_LARGE_FILE_BYTES=5242880
# ANOMALY_LARGE_UPLOAD_LIMIT=20
# ANOMALY_DUPLICATE_UPLOAD_LIMIT=5
# ANOMALY_AI_SPIKE_ABSOLUTE=50
# ANOMALY_AI_SPIKE_MULTIPLIER=3
# ANOMALY_AI_BASELINE_MIN=10
```
