// Fetch the real API key + project ID from the DB, then run end-to-end API tests.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const key = await db.apiKey.findFirst({ where: { revokedAt: null }, orderBy: { createdAt: 'desc' } })
  const project = await db.project.findFirst()
  if (!key || !project) { console.log('no key/project — run reseed first'); return }
  // We can't recover the plaintext from the hash. Re-create one.
  const { generateApiKey, hashApiKey } = await import('../src/lib/noetfield.ts')
  const plaintext = generateApiKey()
  await db.apiKey.update({ where: { id: key.id }, data: { keyHash: hashApiKey(plaintext), keyPrefix: plaintext.slice(0, 12) } })
  console.log('FULL_KEY=' + plaintext)
  console.log('PROJECT_ID=' + project.id)
  // Write to env file for the bash test
  const fs = await import('fs')
  fs.writeFileSync('/tmp/nf-env.sh', `export NF_KEY="${plaintext}"\nexport NF_PROJECT="${project.id}"\n`)
}
main().finally(() => db.$disconnect())
