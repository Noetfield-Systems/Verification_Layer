# Noetfield Verification Layer — hardened release candidate

**Release date:** 2026-11-09  
**Release status:** SOURCE PREPARED, **NOT** LAUNCHED OR DEPLOYED.

## Delivered source changes

- Passwordless onboarding requires successful delivery and confirmation of a six-digit email code before an API key is issued. Short-lived, HMAC-hashed challenges have a per-email cooldown, attempt limit, and single-use consume.
- Authenticated API keys and project ownership checks for dashboard, keys, projects, verification history, usage, receipt JSON, PDF downloads, and attestations. Removed unauthenticated demo fallback from the user journey.
- Project-specific deterministic verdict hashes; one tenant's repeated artifact hashes consistently, while cross-tenant artifacts cannot share a receipt record.
- Free-tier use counted per project, rather than bypassed by creating more keys. Explicit read/write scopes on verification endpoints.
- Demo seeding requires an explicit operator secret. Sina control endpoints also require a separate operator secret.
- Production secrets fail closed; live signing secrets must be explicitly configured. Usage/cost display distinguishes estimates from actual infrastructure spend. Marketing no longer pretends that checkout is activated.
- PostgreSQL Prisma schema, dedicated Railway Dockerfile, health endpoint, environment template, CI workflow, and detailed production rollout checklist.
- Deterministic engine regression test for 8-gate PASS/FAIL behavior and cross-tenant hash separation.

## Verification executed in this workspace

- `node tests/engine-regression.cjs`: **PASS**.
- Global TypeScript transpile syntax parse of .ts/.tsx files: **PASS**. This is **not** a `tsc --noEmit` typecheck.
- `git diff --check`: **PASS**.
- Actual dependency installation, Next production compilation, full lint, browser E2E, Railway deployment, and live smoke verification: **NOT RUN / NOT PROVEN** due the current isolated tool environment and the lack of a dedicated source-controlled deployment target.

## Deployment exclusions and unresolved production gates

1. Never publish the original `.git`, `.env`, or local `db/custom.db`. They are intentionally excluded from this release archive. The original Git history tracks environment secrets; rotate its credentials before using the project.
2. The existing `Noetfield-Systems/Noetfield` monorepo and `noetfield-platform/platform-api` Railway service are unrelated. Do not deploy this project onto them. Create a dedicated GitHub repo and a separate Railway PostgreSQL + app service; see `download/docs/deploy-to-production.md`.
3. Must provision verified Resend sending domain, key, a unique receipt-secret, verifier-secret, and Sina control token.
4. Must run full CI, a clean production build, database schema migration, and two-tenant browser/API smoke tests in the new environment before switching the public DNS.
5. Quota enforcement still has a concurrent-request race. It needs transactional reservation before accepting untrusted high-volume customer traffic. Rate limiting on signup also needs IP/network controls at the edge.
6. The “independent verifier” is currently implemented within the same application and database. Its different HMAC secret is *not* independent infrastructure, cryptographic nonrepudiation, or third-party attestation.
7. This does not establish SOC 2, GDPR, FINTRAC, EU AI Act compliance or an independently audited safety claim. Paid Stripe checkout and commercial onboarding remain uncommissioned. Browser localStorage still stores the key; production session hardening remains necessary.

**No existing production Railway services were modified as part of this release.**
