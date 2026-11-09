/**
 * Re-seed script: clears existing demo verifications + receipts + audit log,
 * then calls the seed endpoint so new verifications pick up the cost env var.
 * Run: bun run scripts/reseed.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  // Cascade-ish delete (SQLite has no FK cascade by default, delete children first)
  await db.receipt.deleteMany({})
  await db.auditLog.deleteMany({})
  await db.verification.deleteMany({})
  await db.independentAttestation.deleteMany({})
  await db.sinaMemory.deleteMany({})
  await db.nextActionCandidate.deleteMany({})
  await db.apiKey.deleteMany({})
  await db.project.deleteMany({})
  await db.user.deleteMany({})
  await db.enginePolicy.deleteMany({})
  console.log('[reseed] cleared all demo data (incl. SinaMemory + IndependentAttestation + NextActionCandidate)')
  // Now hit the seed endpoint (server must be running on :3000)
  const res = await fetch('http://localhost:3000/api/seed', { method: 'POST' })
  const json = await res.json()
  console.log('[reseed] seed response status:', res.status)
  console.log('[reseed] api_key:', json.api_key?.prefix, json.api_key?.plaintext?.slice(0, 16) + '…')
  console.log('[reseed] sample_count:', json.sample_count)
  // Verify a sample verification has cost
  const v = await db.verification.findFirst({ orderBy: { createdAt: 'desc' } })
  console.log('[reseed] latest verification cost_usd:', v?.costUsd, 'verdict:', v?.verdict)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
