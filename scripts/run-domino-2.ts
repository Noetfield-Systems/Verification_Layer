/**
 * Trigger Sina's Domino 2 from the CLI — now with REAL integrations.
 * Usage: bun run scripts/run-domino-2.ts [dominoRun] [projectId]
 *
 * Shows integration status: whether DeepSeek + GitHub are real or simulated.
 */

async function main() {
  const dominoRun = Number(process.argv[2] || '2')
  const projectId = process.argv[3]
  const baseUrl = process.env.NOETFIELD_API_URL || 'http://localhost:3000'

  console.log(`[domino] triggering domino ${dominoRun} at ${baseUrl} ...`)
  const resp = await fetch(`${baseUrl}/api/sina/run-domino-2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dominoRun, projectId }),
  })
  const data = await resp.json()
  if (!resp.ok) {
    console.error(`[domino] FAILED: HTTP ${resp.status}`, data)
    process.exit(1)
  }
  console.log(`[domino] run ${data.dominoRun} complete`)
  console.log(`  started:    ${data.startedAt}`)
  console.log(`  finished:   ${data.finishedAt}`)
  console.log(`  steps:      ${data.steps.length}`)
  console.log(`  receipts:   ${data.receiptsIssued.length}`)
  data.receiptsIssued.forEach((h: string, i: number) =>
    console.log(`    [${i + 1}] ${h}`),
  )
  console.log(`  independent attestations: ${data.attestationsIssued.length}`)
  data.attestationsIssued.forEach((h: string, i: number) =>
    console.log(`    [${i + 1}] ${h}`),
  )
  console.log(`  github commits: ${data.githubCommits.length}`)
  data.githubCommits.forEach((c: { candidateId: string; branch: string; sha: string; url: string; real: boolean }, i: number) =>
    console.log(`    [${i + 1}] ${c.branch} (${c.real ? 'REAL' : 'simulated'}) sha=${c.sha.slice(0, 12)}`),
  )
  console.log(`  aborted:    ${data.aborted}`)
  if (data.aborted) console.log(`  reason:     ${data.abortReason}`)
  console.log(`  next action (NO new prompt): ${data.nextActionSelected}`)
  console.log('')
  console.log('[domino] integration status:')
  console.log(`  deepseek:        ${data.integrationStatus.deepseek}`)
  console.log(`  github:          ${data.integrationStatus.github}`)
  console.log(`  candidateSource: ${data.integrationStatus.candidateSource}`)
  console.log('')
  console.log('[domino] step trace:')
  for (const s of data.steps) {
    const verdict = s.verdict ? ` [${s.verdict.toUpperCase()}]` : ''
    const hash = s.verdictHash ? ` ${s.verdictHash.slice(0, 24)}…` : ''
    const att = s.attestationVerified != null ? ` attested=${s.attestationVerified}` : ''
    const fix = s.fixSource ? ` fix=${s.fixSource}` : ''
    const gh = s.githubReal != null ? ` github=${s.githubReal ? 'REAL' : 'sim'}` : ''
    console.log(`  step ${String(s.step).padStart(3)} ${s.action.padEnd(20)} ${s.candidateLabel}${verdict}${hash}${att}${fix}${gh}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
