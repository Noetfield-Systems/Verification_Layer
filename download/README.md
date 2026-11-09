# Noetfield Verification Layer

> **Agent Execution Assurance** — Cryptographic proof that your AI agent's code is safe to deploy.

Noetfield is the "Cloudflare for Agents." Every agent execution is a black box. Enterprises won't deploy black boxes. Noetfield is the cryptographic proof-of-execution layer that makes autonomous AI deployable in regulated industries.

This repository contains the full commercial product: a premium marketing landing page, the enterprise dashboard, the G0-G7 deterministic verification engine, and the SDK + CLI + GitHub Action.

---

## What's proven

The core thesis — **a deterministic verification engine that produces mathematically identical verdict hashes across 100 adversarially perturbed runs** — is verified end-to-end:

```
[determinism] distinct verdict hashes across 100 runs: 1
[determinism] verdict_hash = sha256:7baed602ba0766bcc5f5f6bbcd795995dd74bafdb025879e676478eb2c58d99d
[negative-control] perturbed hash differs from baseline — OK
[receipt] valid signature verifies: true
[receipt] tampered receipt rejected: true
[token] issued: yes
[fail] verdict=fail token=null (correct)
[fail] failed gates: G1 Policy, G2 Credential, G3 License, G7 Deploy Token
```

Run it yourself: `bun run scripts/test-engine.ts`

The live API (when deployed) satisfies the same invariant via `curl`:
```
=== 100 calls, same artifact ===
Total successful responses: 100
Distinct verdict_hash values: 1
```

---

## Premium product surface

The dashboard opens to a **marketing landing page** with hero, animated "100 runs → 1 hash" determinism counter, social proof strip, three pillars (Verify → Token → Audit), interactive demo embed, feature grid, code sample, pricing tiers, and footer. The **"Launch Dashboard"** CTA flips to the enterprise dashboard shell.

**Linear/Vercel-style polish throughout:**
- ⌘K / Ctrl+K **command palette** with Navigate + Actions + Help groups, fuzzy filter, keyboard navigation
- **Glassmorphic top bar** with breadcrumb (Dashboard / section) + ⌘K hint button + refined account chip
- **System status bar** in the sidebar footer with pulsing emerald "live" dot, real measured latency (polled every 30s), policy version + hash prefix
- **Refined brand mark** — a layered hexagonal containment prism with verdict axis and deterministic anchor (SVG, scales 16px → 80px)
- **Micro-interactions** — framer-motion page transitions (opacity + y-translate), animated counters on the hero, hover slide-right on the active nav indicator
- **Delight moments** — canvas-confetti fires on first PASS in the playground, on API key creation, and on dashboard entry (side cannons)
- **Tasteful gradient accents** — emerald mesh behind the hero, gradient avatar in the account chip, emerald CTA buttons. No gradients-as-decoration elsewhere.

---

## Repository structure

```
.
├── prisma/schema.prisma              # Noetfield schema (ApiKeys, Projects, Verifications, Receipts, AuditLog, EnginePolicy)
├── src/
│   ├── app/
│   │   ├── page.tsx                  # App shell: landing → dashboard via store flag, command palette global
│   │   ├── layout.tsx                # Dark-mode root layout, Inter + JetBrains Mono
│   │   ├── globals.css               # Enterprise dark theme (#0A0A0A / #141414 / #262626)
│   │   └── api/
│   │       ├── v1/                   # Phase 1 public API (verify, verify/:id, receipt/:hash, verify-token)
│   │       ├── dashboard/            # Stats + verifications + audit + projects + single
│   │       ├── keys/, projects/, audit/, receipt-pdf/, seed/
│   ├── lib/
│   │   ├── engine/                   # G0-G7: hash, gates, token, verify orchestrator
│   │   ├── noetfield.ts              # Server config: secret, cost, API key hashing, policy bootstrap
│   │   ├── db.ts                     # Prisma client
│   │   ├── dashboard-store.ts        # Zustand: activeView, enteredDashboard, selectedVerificationId, apiKey
│   │   ├── dashboard-api.ts          # TanStack Query hooks
│   │   └── dashboard-types.ts        # Shared TS types
│   └── components/dashboard/
│       ├── landing.tsx               # Premium marketing page (hero, pillars, demo, pricing, footer)
│       ├── command-palette.tsx       # ⌘K palette (cmdk)
│       ├── confetti.tsx              # Delight moments (canvas-confetti)
│       ├── sidebar.tsx               # Refined nav + system status bar with live latency
│       ├── topbar.tsx                # Glassmorphic breadcrumb + ⌘K hint
│       ├── logo.tsx                  # Layered hexagonal brand mark + wordmark
│       ├── overview.tsx, verifications.tsx, verification-detail.tsx, verify-playground.tsx,
│       ├── api-keys.tsx, projects.tsx, audit-log.tsx, billing.tsx, integrations.tsx, docs.tsx
│       └── (shared: verdict-badge, copyable-hash, stat-card, gate-result, code-block, etc.)
├── scripts/{test-engine,reseed,get-key}.ts
└── download/                         # Phase 3 — SDK + CLI + GitHub Action
    ├── sdk-js/, sdk-py/, cli/, github-action/, docs/
```

---

## The G0-G7 Engine

| Gate | What it checks | FAIL trigger |
|---|---|---|
| **G0 Provenance** | Where did this code come from? | Source not in `bolt/v0/cursor/custom` |
| **G1 Policy** | No direct prod DB, no hardcoded secrets | `postgres://user:pass@…`, `DB_PASSWORD="..."` |
| **G2 Credential** | Detect AWS/GCP/Stripe/GitHub/Slack keys | `AKIA…`, `sk_live_…`, `ghp_…`, `xox…` |
| **G3 License** | Proper license present | No SPDX identifier or copyright header |
| **G4 Transform Fidelity** | Code wasn't mangled in transit | U+FFFD, control chars, bracket imbalance |
| **G5 Policy Immutability** | Rules weren't tampered with | Running `POLICY_HASH` ≠ stored hash |
| **G6 Unordered Commit Lock** | File ordering doesn't matter | (Always passes — enforced in hash) |
| **G7 Deploy Token** | HMAC bound to artifact hash, 15-min TTL | (Only issued if G0-G6 all pass) |

**Verdict hash** = `SHA-256(artifact_hash | gate_digest | POLICY_HASH | policy_version)`. Deterministic by construction: no `Date.now()`, no `Math.random()`, no unsorted object keys.

**Receipt** = canonical JSON of the full verification record, signed with `HMAC-SHA256(NOETFIELD_RECEIPT_SECRET, receiptJson)`. Any byte-level change to the receipt breaks the signature — tamper-evident by design.

---

## Phase 1 — Verification API

### Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/verify` | `Bearer nf_live_…` | Submit artifact → verdict + hash + token (idempotent) |
| `GET` | `/api/v1/verify/:job_id` | `Bearer nf_live_…` | Poll job status |
| `GET` | `/api/v1/receipt/:verdict_hash` | public | Fetch tamper-proof receipt |
| `POST` | `/api/v1/verify-token` | — | Verify a deploy token before deploying |

### Idempotency

Submitting the same artifact twice returns the same `verdict_hash` and the same receipt — by design. The receipt IS the proof; re-submitting the same artifact must NOT create a second row. **100 calls with the same artifact produce 1 receipt, retrievable by `verdict_hash`**.

---

## Phase 2 — Premium Dashboard

Single-page Next.js 16 app at `/`. **Landing page is the default view** — "Launch Dashboard" CTA flips to the dashboard shell. Dark mode enterprise aesthetic (Vercel + Stripe + Linear). 10 dashboard views:

1. **Overview** — stat cards, 7-day trend chart, recent verifications, three pillars
2. **Verifications** — filterable table (project / verdict / search)
3. **Verification Detail** — 8 gates with evidence, receipt JSON, signature check, deploy token countdown, PDF export
4. **Verify Playground** — interactive demo, paste code → real verdict + gates + token + confetti on PASS
5. **API Keys** — create / list / revoke, plaintext shown once + confetti
6. **Projects** — card grid, create new
7. **Audit Log** — table, CSV / JSON export
8. **Billing** — real cost tracking, 7-day cost chart, per-project breakdown
9. **Integrations** — Bolt / v0 / Cursor / GitHub Action / CLI setup guides
10. **Docs** — API reference, gate table, error envelope

**Premium product surface:**
- ⌘K command palette (navigate + actions + help)
- Glassmorphic top bar with breadcrumb + ⌘K hint
- System status bar (live latency, policy hash, pulsing emerald dot)
- Refined layered-hexagon brand mark
- Framer-motion page transitions
- Canvas-confetti delight moments (PASS, key create, dashboard entry)
- Tasteful emerald gradient accents (hero mesh, CTAs, avatars)

Mobile responsive (sidebar collapses to drawer, tables scroll, landing stacks).

---

## Phase 3 — SDK + CLI + GitHub Action

All three packages live in `download/`:

- **`@noetfield/sdk`** (`download/sdk-js/`) — TypeScript SDK, `npm install @noetfield/sdk`
- **`noetfield`** (`download/sdk-py/`) — Python SDK, `pip install noetfield`
- **`@noetfield/cli`** (`download/cli/`) — CLI, `npm install -g @noetfield/cli`
- **`noetfield/verify-action`** (`download/github-action/`) — GitHub Action for PR verification

See each package's README for usage. The SDK + CLI both call the live API at `https://api.noetfield.com` (override via `NOETFIELD_API_URL` env var).

---

## Local development

```bash
# Install
bun install

# Database (SQLite for dev; swap to Supabase Postgres for production)
bun run db:push

# Seed demo data
curl -X POST http://localhost:3000/api/seed

# Get an API key for curl testing
bun run scripts/get-key.ts

# Run the determinism smoke test
bun run scripts/test-engine.ts

# Re-seed (clears + recreates demo data)
bun run scripts/reseed.ts

# Dev server
bun run dev   # auto-started in this sandbox

# Lint
bun run lint
```

---

## Deploy to Cloudflare

The Next.js app deploys to **Cloudflare Pages** via OpenNext. The API routes (under `src/app/api/`) become Cloudflare Worker endpoints — same code, no rewrite needed.

### 1. Set required secrets

```bash
openssl rand -hex 32  # generate the HMAC secret
wrangler secret put NOETFIELD_RECEIPT_SECRET
wrangler secret put NOETFIELD_COST_PER_VERIFY_USD  # e.g. 0.0008
```

### 2. Point Prisma at Supabase Postgres

Edit `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

Set `DATABASE_URL` to your Supabase connection string, then `bunx prisma db push`.

### 3. Deploy via OpenNext

```bash
bunx opennextjs-cloudflare
bunx wrangler pages deploy
```

### 4. Map custom domains

- `noetfield.com` → Cloudflare Pages (the dashboard)
- `api.noetfield.com` → Cloudflare Worker (the verification API)

---

## Configuration reference

| Env var | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | `file:./noetfield.db` | Prisma connection string |
| `NOETFIELD_RECEIPT_SECRET` | yes (prod) | dev fallback | HMAC secret for receipts + tokens |
| `NOETFIELD_COST_PER_VERIFY_USD` | no | `0.0008` | Real cost per verification (USD) |
| `NOETFIELD_API_URL` | no | `https://api.noetfield.com` | Override API base URL (SDK + CLI) |

---

## Acceptance — verified in this build

- [x] `bun run lint`: 0 errors
- [x] Engine determinism test: 100 runs, 1 hash, tampered receipt rejected, bad artifact fails
- [x] API 100-call determinism: 1 distinct verdict hash
- [x] PDF download: HTTP 200, valid PDF document
- [x] Browser verification: landing renders, command palette (⌘K) works, dashboard renders, all 10 views reachable, playground runs real verification with confetti on PASS, mobile responsive
- [x] Zero accessibility warnings (Radix DialogTitle wired via VisuallyHidden)
- [x] System status bar shows real measured latency (~100ms)

---

## License

MIT © Noetfield Systems

