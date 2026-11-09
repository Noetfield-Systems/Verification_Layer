/**
 * Test the free-tier wall: submit 100 unique artifacts, then the 101st
 * should return HTTP 402 with code "free_tier_exceeded".
 *
 * Usage: bun run scripts/test-free-tier-wall.ts
 */
async function main() {
  const baseUrl = 'http://localhost:3000'

  // 1. Signup fresh
  console.log('[wall] signing up fresh user...')
  const email = `wall-test-${Date.now()}@noetfield.com`
  const signup = await fetch(`${baseUrl}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const { api_key: apiKey, project_id: projectId } = await signup.json()
  console.log(`[wall] got key ${apiKey.slice(0, 16)}... for ${email}`)

  // 2. Check usage starts at 0
  const usage0 = await fetch(`${baseUrl}/api/v1/usage`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  }).then((r) => r.json())
  console.log(`[wall] usage before: ${usage0.usage_count}/${usage0.free_tier_limit}`)

  // 3. Submit 100 unique artifacts (append a counter to make each one unique)
  const LIMIT = 100
  console.log(`[wall] submitting ${LIMIT} unique artifacts...`)
  let passed = 0
  let failed = 0
  for (let i = 0; i < LIMIT; i++) {
    const artifact = `// SPDX-License-Identifier: MIT\n// Copyright (c) 2026 No ${i}\nexport function handler${i}(req) { return { ok: true, n: ${i} }; }\n`
    const resp = await fetch(`${baseUrl}/api/v1/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artifact,
        artifact_type: 'code',
        metadata: { source: 'cursor', project_id: projectId },
      }),
    })
    const data = await resp.json()
    if (data.verdict === 'pass') passed++
    else failed++
    if (i % 25 === 0 || i === LIMIT - 1) {
      console.log(`  [${i + 1}/${LIMIT}] verdict=${data.verdict} http=${resp.status}`)
    }
  }
  console.log(`[wall] ${passed} passed, ${failed} failed`)

  // 4. Check usage is now at the limit
  const usage1 = await fetch(`${baseUrl}/api/v1/usage`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  }).then((r) => r.json())
  console.log(`[wall] usage after: ${usage1.usage_count}/${usage1.free_tier_limit} remaining=${usage1.remaining}`)

  // 5. THE WALL: 101st call should return 402
  console.log('[wall] submitting 101st artifact (should hit the wall)...')
  const wallArtifact = `// SPDX-License-Identifier: MIT\nexport function over(req) { return "wall"; }\n`
  const wallResp = await fetch(`${baseUrl}/api/v1/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      artifact: wallArtifact,
      artifact_type: 'code',
      metadata: { source: 'cursor', project_id: projectId },
    }),
  })
  const wallData = await wallResp.json()
  console.log(`[wall] HTTP ${wallResp.status}`)
  console.log(`[wall] error.code: ${wallData.error?.code}`)
  console.log(`[wall] message: ${wallData.error?.message}`)
  console.log(`[wall] upgrade_url: ${wallData.error?.upgrade_url}`)

  if (wallResp.status === 402 && wallData.error?.code === 'free_tier_exceeded') {
    console.log('\n=== FREE-TIER WALL WORKS ===')
    console.log(`100 verifications allowed, 101st blocked with 402 + upgrade_url.`)
  } else {
    console.error('\n=== WALL FAILED ===')
    console.error(`Expected HTTP 402 + free_tier_exceeded, got HTTP ${wallResp.status}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
