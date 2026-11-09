#!/usr/bin/env node
/**
 * Noetfield CLI — verify AI-generated artifacts from the command line.
 *
 * Usage:
 *   noetfield verify ./my-code.py --api-key nf_live_...
 *   noetfield verify ./my-project/ --api-key nf_... --recursive
 *   noetfield token-check nf_tok_1.1234.abc... --artifact-hash sha256:...
 *   noetfield receipt sha256:abc123...
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { Noetfield, NoetfieldError } from '@noetfield/sdk'

interface CliArgs {
  command: string
  apiKey?: string
  projectId?: string
  source?: string
  artifactType?: string
  recursive?: boolean
  baseUrl?: string
  blockOnFail?: boolean
  positional: string[]
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2)
  const out: CliArgs = { command: '', positional: [] }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--api-key') out.apiKey = args[++i]
    else if (a === '--project-id') out.projectId = args[++i]
    else if (a === '--source') out.source = args[++i]
    else if (a === '--artifact-type') out.artifactType = args[++i]
    else if (a === '--recursive' || a === '-r') out.recursive = true
    else if (a === '--base-url') out.baseUrl = args[++i]
    else if (a === '--block-on-fail') out.blockOnFail = true
    else if (a === '--help' || a === '-h') { out.command = 'help' }
    else if (a.startsWith('--')) {
      // unknown flag — skip its value if next looks like a value
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) i++
    } else {
      if (!out.command) out.command = a
      else out.positional.push(a)
    }
  }
  return out
}

function readEnvApiKey(): string | undefined {
  return process.env.NOETFIELD_API_KEY
}

function readArtifactFile(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch (e) {
    console.error(`Error: could not read file ${path}: ${(e as Error).message}`)
    process.exit(1)
  }
}

function readArtifactDir(dir: string, recursive: boolean): Record<string, string> {
  const bundle: Record<string, string> = {}
  function walk(d: string, base: string) {
    const entries = readdirSync(d)
    for (const entry of entries) {
      const full = join(d, entry)
      const rel = relative(base, full)
      const st = statSync(full)
      if (st.isDirectory()) {
        if (recursive) walk(full, base)
      } else if (st.isFile()) {
        // skip obvious junk
        if (entry === '.DS_Store' || entry.endsWith('.log')) continue
        try {
          bundle[rel] = readFileSync(full, 'utf8')
        } catch {
          // binary or unreadable — skip
        }
      }
    }
  }
  walk(dir, dir)
  return bundle
}

function printGateTable(gates: Array<{ name: string; passed: boolean; detail: string }>): void {
  console.log('')
  console.log('  Gate results:')
  for (const g of gates) {
    const symbol = g.passed ? '\u2713' : '\u2717'
    const color = g.passed ? '\x1b[32m' : '\x1b[31m'
    const reset = '\x1b[0m'
    console.log(`    ${color}${symbol}${reset} ${g.name}`)
    console.log(`        ${g.detail}`)
  }
  console.log('')
}

async function cmdVerify(args: CliArgs): Promise<number> {
  const apiKey = args.apiKey || readEnvApiKey()
  if (!apiKey) {
    console.error('Error: --api-key is required (or set NOETFIELD_API_KEY env var)')
    return 2
  }
  const target = args.positional[0]
  if (!target) {
    console.error('Error: specify a file or directory to verify')
    return 2
  }
  const projectId = args.projectId || process.env.NOETFIELD_PROJECT_ID
  if (!projectId) {
    console.error('Error: --project-id is required (or set NOETFIELD_PROJECT_ID env var)')
    return 2
  }
  const resolved = resolve(target)
  const st = statSync(resolved)
  let artifact: string | Record<string, string>
  let artifactRef: string
  if (st.isDirectory()) {
    artifact = readArtifactDir(resolved, args.recursive ?? false)
    artifactRef = `${target}/ (${Object.keys(artifact).length} files)`
  } else {
    artifact = readArtifactFile(resolved)
    artifactRef = target
  }
  const nf = new Noetfield({ apiKey, baseUrl: args.baseUrl })
  console.log(`Verifying ${artifactRef} ...`)
  try {
    const result = await nf.verify({
      artifact,
      artifactType: (args.artifactType as 'code' | 'workflow' | 'config') || 'code',
      metadata: {
        projectId,
        source: (args.source as 'bolt' | 'v0' | 'cursor' | 'custom') || 'custom',
      },
    })
    const color = result.verdict === 'pass' ? '\x1b[32m' : '\x1b[31m'
    const reset = '\x1b[0m'
    console.log(`${color}Verdict: ${result.verdict?.toUpperCase()}${reset}`)
    if (result.verdictHash) console.log(`  verdict_hash: ${result.verdictHash}`)
    if (result.artifactHash) console.log(`  artifact_hash: ${result.artifactHash}`)
    if (result.costUsd != null) console.log(`  cost_usd:     $${result.costUsd.toFixed(6)}`)
    if (result.deployToken) console.log(`  deploy_token: ${result.deployToken}`)
    if (result.tokenExpiry) console.log(`  token_expiry: ${result.tokenExpiry}`)
    if (result.receiptUrl) console.log(`  receipt:      ${result.receiptUrl}`)
    if (result.gates) printGateTable(result.gates)
    if (result.verdict !== 'pass' && args.blockOnFail) {
      console.error('Block-on-fail: verification failed, exiting with code 1')
      return 1
    }
    return result.verdict === 'pass' ? 0 : 1
  } catch (e) {
    if (e instanceof NoetfieldError) {
      console.error(`Error [${e.code}] (status ${e.status}): ${e.message}`)
    } else {
      console.error(`Error: ${(e as Error).message}`)
    }
    return 1
  }
}

async function cmdTokenCheck(args: CliArgs): Promise<number> {
  const apiKey = args.apiKey || readEnvApiKey()
  if (!apiKey) {
    console.error('Error: --api-key is required')
    return 2
  }
  const token = args.positional[0]
  const artifactHash = args.positional.find((p) => p.startsWith('sha256:')) ||
    args.positional.find((p, i) => i > 0 && !p.startsWith('nf_'))
  if (!token || !artifactHash) {
    console.error('Usage: noetfield token-check <deploy_token> <artifact_hash>')
    return 2
  }
  const nf = new Noetfield({ apiKey, baseUrl: args.baseUrl })
  try {
    const check = await nf.verifyToken(token, artifactHash)
    const color = check.valid ? '\x1b[32m' : '\x1b[31m'
    const reset = '\x1b[0m'
    console.log(`${color}Token ${check.valid ? 'VALID' : 'INVALID'}${reset}`)
    console.log(`  reason:             ${check.reason}`)
    console.log(`  signature_valid:    ${check.signatureValid}`)
    console.log(`  expired:            ${check.expired}`)
    console.log(`  expiry:             ${check.expiry ?? 'n/a'}`)
    if (check.verdictHash) console.log(`  verdict_hash:       ${check.verdictHash}`)
    return check.valid ? 0 : 1
  } catch (e) {
    if (e instanceof NoetfieldError) {
      console.error(`Error [${e.code}] (status ${e.status}): ${e.message}`)
    } else {
      console.error(`Error: ${(e as Error).message}`)
    }
    return 1
  }
}

async function cmdReceipt(args: CliArgs): Promise<number> {
  const verdictHash = args.positional[0]
  if (!verdictHash) {
    console.error('Usage: noetfield receipt <verdict_hash>')
    return 2
  }
  // Receipt endpoint is public — no API key required, but we use the SDK if one is present.
  const baseUrl = args.baseUrl || process.env.NOETFIELD_API_URL || 'https://api.noetfield.com'
  const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/receipt/${verdictHash}`)
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}))
    console.error(`Error: ${data?.error?.message || resp.statusText}`)
    return 1
  }
  const data = await resp.json()
  console.log(JSON.stringify(data.receipt, null, 2))
  console.log('')
  console.log(`  signature:        ${data.signature}`)
  console.log(`  signature_algo:   ${data.signature_algorithm}`)
  return 0
}

function printHelp(): void {
  console.log(`
Noetfield CLI — verify AI-generated artifacts from the command line.

Usage:
  noetfield verify <file-or-dir>     Verify an artifact (file or directory)
  noetfield token-check <token> <h>  Verify a deploy token before deploying
  noetfield receipt <verdict_hash>   Fetch the tamper-proof receipt

Options:
  --api-key <key>           API key (or set NOETFIELD_API_KEY)
  --project-id <id>         Project ID (or set NOETFIELD_PROJECT_ID)
  --source <s>              Source: bolt | v0 | cursor | custom (default: custom)
  --artifact-type <t>       Type: code | workflow | config (default: code)
  --recursive, -r           For directories: include subdirectories
  --base-url <url>          Override API base URL
  --block-on-fail           Exit code 1 on FAIL (for CI usage)
  --help, -h                Show this help

Examples:
  noetfield verify ./handler.ts --api-key nf_live_...
  noetfield verify ./src/ --recursive --block-on-fail
  noetfield token-check nf_tok_1.1234.abc... sha256:deadbeef...
  noetfield receipt sha256:abc123...

Exit codes:
  0  verification passed (or token valid)
  1  verification failed (or token invalid)
  2  usage error
`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (!args.command || args.command === 'help') {
    printHelp()
    process.exit(0)
  }
  let code: number
  switch (args.command) {
    case 'verify':
      code = await cmdVerify(args)
      break
    case 'token-check':
      code = await cmdTokenCheck(args)
      break
    case 'receipt':
      code = await cmdReceipt(args)
      break
    default:
      console.error(`Unknown command: ${args.command}`)
      printHelp()
      code = 2
  }
  process.exit(code)
}

main().catch((e) => {
  console.error(`Fatal: ${(e as Error).message}`)
  process.exit(1)
})
