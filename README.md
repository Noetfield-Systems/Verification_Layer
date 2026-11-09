# Noetfield Verification Layer

Governed artifact verification with eight deterministic gates, project-scoped API keys, signed receipts, a customer dashboard and a PostgreSQL-backed audit trail.

**Security:** API keys and email OTPs must never be committed. Do not promote the previous sandbox's `.env` or SQLite database. This service requires PostgreSQL and live `NOETFIELD_RECEIPT_SECRET`, `NOETFIELD_VERIFIER_SECRET` and `NOETFIELD_SINA_CONTROL_TOKEN` before public signup.

## Build and tests

```bash
bun install --frozen-lockfile
cp prisma/schema.postgres.prisma prisma/schema.prisma
DATABASE_URL='postgresql://...' bunx prisma generate
DATABASE_URL='postgresql://...' bunx prisma db push --skip-generate
bun run lint
bunx tsc --noEmit
bun run build
node tests/engine-regression.cjs
node tests/e2e-api.mjs  # real PostgreSQL and mock email transport, CI=true
```

GitHub Actions runs integration tests against a disposable Postgres service; E2E covers email OTP, two-tenancy, 8-gate verification, receipt isolation, idempotency, free-tier quota and concurrent requests. Details: `download/docs/deploy-to-production.md` and `RELEASE_NOTES.md`.

**Scope:** Deterministic artifact checks and HMAC receipt signatures are not equivalent to an independently audited software supply chain, cryptographic non-repudiation, or a third-party verifier. Upgrade claims only after separate verification infrastructure exists.
