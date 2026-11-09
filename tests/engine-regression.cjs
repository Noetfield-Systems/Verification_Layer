/* Dependency-minimal deterministic engine regression check.
 * bun/npm install first: typescript is a devDependency.
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
let ts
try { ts = require('typescript') } catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript') }
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'noetfield-engine-'))
try {
  for (const name of ['hash', 'gates', 'token', 'verify']) {
    const source = fs.readFileSync(path.join(__dirname, '../src/lib/engine', name + '.ts'), 'utf8')
    const result = ts.transpileModule(source, { fileName: name + '.ts', reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
    assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, 'TypeScript parse errors')
    fs.writeFileSync(path.join(scratch, name + '.js'), result.outputText)
  }
  const { runVerification } = require(path.join(scratch, 'verify.js'))
  const { POLICY_HASH } = require(path.join(scratch, 'gates.js'))
  const deps = { expectedPolicyHash: POLICY_HASH, secret: 'test-only-unique-secret-never-use-in-prod', costUsdPerVerify: 0.0008, issuedAtUnix: 1794200000 }
  const artifact = '// SPDX-License-Identifier: MIT\n// Copyright (c) Noetfield\nexport function hello(){return "ok"}\n'
  const a = runVerification({ artifact, artifactType: 'code', source: 'cursor', projectId: 'tenant-A' }, deps)
  const a2 = runVerification({ artifact, artifactType: 'code', source: 'cursor', projectId: 'tenant-A' }, { ...deps, issuedAtUnix: deps.issuedAtUnix + 20 })
  const b = runVerification({ artifact, artifactType: 'code', source: 'cursor', projectId: 'tenant-B' }, deps)
  assert.equal(a.verdict, 'pass')
  assert.equal(a.verdictHash, a2.verdictHash, 'same artifact+tenant+policy must be stable across timestamps')
  assert.notEqual(a.verdictHash, b.verdictHash, 'cross-tenant hash collision MUST NOT occur')
  assert.equal(a.gates.length, 8)
  const fail = runVerification({ artifact: 'const key = "AKIAIOSFODNN7EXAMPLE";', artifactType: 'code', source: 'cursor', projectId: 'tenant-A' }, deps)
  assert.equal(fail.verdict, 'fail', 'hardcoded sample credential must fail')
  assert.equal(fail.deployToken, null, 'failed artifact cannot receive deploy token')
  console.log('PASS: PASS/FAIL gates, 8 gates, deterministic same-tenant hash, separate-tenant hash, no FAIL deploy token')
} finally {
  fs.rmSync(scratch, { recursive: true, force: true })
}
