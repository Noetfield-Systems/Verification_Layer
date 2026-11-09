# Verification Platform — Real Railway release checklist (November 2026)

**State:** Hardened source candidate. NOT deployed by the preparation process. Do not attach it to the existing `noetfield-platform/platform-api` service: that is a DIFFERENT app, built from `Noetfield-Systems/Noetfield` monorepo. Do not replace `www.noetfield.com`; deploy a dedicated `verify.noetfield.com` app after validation.

## Release blockers before customer-facing access

1. Commit **clean source only** to a dedicated GitHub repository. Do NOT push the original tarball's `.git` directory: its history includes a committed `.env` and an SQLite database. Treat any keys/secrets from the original archive as exposed, and rotate them. This release archive intentionally excludes both files and Git history.
2. Use a new Railway service (not the existing Noetfield production services) with this repo connected; Dockerfile root = `Dockerfile`, port 3000.
3. Provision Railway PostgreSQL with persistent storage and backups. Use the railway-internal `DATABASE_URL` reference, not SQLite. Do not reuse the sample database.
4. Run the initial schema bootstrap from the build image with the live DB URL **once**: `bunx prisma db push --schema prisma/schema.prisma` (production image has already replaced `schema.prisma` with the PostgreSQL variant). Never add `--accept-data-loss`. For subsequent releases use reviewed SQL migrations, not automatic destructive schema updates.
5. Set live service variables in Railway; **do not commit them**:
   - `DATABASE_URL` (Railway Postgres URL)
   - `NOETFIELD_RECEIPT_SECRET` (unique >= 32 random bytes)
   - `NOETFIELD_VERIFIER_SECRET` (a *different* unique >= 32 random bytes)
   - `NOETFIELD_SINA_CONTROL_TOKEN` (a third unique >= 32 random bytes)
   - `RESEND_API_KEY` and `NOETFIELD_EMAIL_FROM` (verified sending domain)
   - `NOETFIELD_PUBLIC_BASE_URL=https://verify.noetfield.com`
   - `NOETFIELD_FREE_TIER_LIMIT=100`, `NOETFIELD_FREE_TIER_WINDOW_DAYS=30`
   - `NOETFIELD_COST_PER_VERIFY_USD=0.0008` (an ESTIMATE, not real provider metering)
   - Optionally `NOETFIELD_DEMO_SEED_TOKEN` for operator-only synthetic data — **never use production customer DB for demos**.
6. Set Railway healthcheck separately and verify a 200 response from `GET /api/health` after DB connectivity. Then map `verify.noetfield.com` using DNS / Railway custom domain; never replace existing root or platform subdomains without independent approvals.
7. Configure email-provider rate limiting, abuse protection, retry policy, error monitoring, and DB backups before public traffic. These are external infrastructure requirements, not supplied by this codebase.

## Build and preflight

The project includes a Bun lockfile. Build in Railway from `Dockerfile` with Bun 1.3, then check the build logs. Local scripts (`bun run lint`, `bun run build`) require dependencies to be installed. Release only after typechecking and build pass in a networked environment — a syntax parser is not a substitute.

## Live smoke suite — required gates

Use two DIFFERENT verified email addresses. For each complete POST `/api/signup` → emailed code → PUT `/api/signup`, then open dashboard with that recipient's key.

- A and B must have different project IDs, keys, 0 initial verifications, and no access to one another's ID, detail view, PDF, receipt, project filters or API-key management.
- A submits a known PASS artifact, then a known FAIL artifact; both appear in A only.
- Re-submit the same artifact to A 100x: one verdict hash and one stored verification. Submit the same artifact as B: independent hash and record scoped to B.
- Revoke a spare key; confirm 401 for that key and no self-revoke of the only active key.
- Confirm monthly free tier is scoped at the **project** level, not a newly minted key; test concurrent requests as well (known race condition).
- Verify no public demo seed, no unauthenticated Sina execution, no cross-tenant receipt/PDF exposure, no missing production secret defaults.
- Independently check HMAC/attestation semantics; the current verifier is in-process and is **NOT** a separate security boundary. Do not market it as a third-party cryptographic attestation.
- Validate Stripe billing before advertising paid plan checkout. Current $49 Pro is a proposal/inquiry, **not** an active subscription flow.

## Honest production scope

This release candidate hardens public signup and tenant API authorization. It does **not** include external security testing, audited billing, high-concurrency quota transactions, a separately isolated verifier, identity provider-grade sessions, SAML, or SOC 2 certification. API keys are still cached in browser localStorage and so require XSS controls and preferably a future HttpOnly session redesign.
