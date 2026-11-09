# @noetfield/sdk

> Cryptographic proof that your AI agent's code is safe to deploy.

Official TypeScript/JavaScript SDK for the [Noetfield Verification Layer](https://noetfield.com) — the "Cloudflare for Agents."

## Install

```bash
npm install @noetfield/sdk
# or
bun add @noetfield/sdk
# or
yarn add @noetfield/sdk
```

## Quick start

```typescript
import { Noetfield } from '@noetfield/sdk';

const nf = new Noetfield({ apiKey: process.env.NOETFIELD_API_KEY });

const result = await nf.verify({
  artifact: codeString,
  artifactType: 'code',
  metadata: { source: 'bolt', projectId: 'proj_123' }
});

if (result.verdict === 'pass') {
  console.log('Deploy token:', result.deployToken);
  // Deploy to Cloudflare/Railway/AWS with the token
} else {
  const failedGates = result.gates?.filter(g => !g.passed);
  console.log('Verification failed:', failedGates);
}
```

## Verify from your agent pipeline

Pipe any AI-generated artifact (Bolt, v0, Cursor, custom agents) through Noetfield before deployment:

```typescript
import { Noetfield } from '@noetfield/sdk';

const nf = new Noetfield({ apiKey: process.env.NOETFIELD_API_KEY });

// After your agent generates code
const candidate = await agent.generateCode(prompt);

const result = await nf.verify({
  artifact: candidate.code,
  artifactType: 'code',
  metadata: {
    source: 'cursor',
    projectId: 'proj_acme_platform',
    modelIdentity: 'deepseek-coder-v2',
  }
});

if (result.verdict !== 'pass') {
  // Feed the failed gates back to the agent for a retry (max 3 attempts)
  await agent.retryWithFeedback(result.gates);
  return;
}

// Safe to deploy — token is bound to this exact artifact hash
await deploy(candidate.code, { noetfieldToken: result.deployToken });
```

## Verify a deploy token (infrastructure side)

From your Cloudflare Worker / Railway service / AWS Lambda — call this before deploying an artifact:

```typescript
import { Noetfield } from '@noetfield/sdk';

const nf = new Noetfield({ apiKey: process.env.NOETFIELD_API_KEY });

const check = await nf.verifyToken(deployToken, artifactHash);
if (!check.valid) {
  throw new Error(`Deploy blocked: ${check.reason}`);
}
// proceed with deploy
```

## Multi-file artifacts

Pass a `{ path: contents }` map. Noetfield canonicalizes paths (sorted) before hashing — file ordering does not affect the verdict hash (G6 unordered commit lock):

```typescript
const result = await nf.verify({
  artifact: {
    'src/handler.ts': `// SPDX-License-Identifier: MIT\nexport function handler() {}`,
    'README.md': '# My module',
    'package.json': '{"name":"my-module"}',
  },
  artifactType: 'code',
  metadata: { source: 'v0', projectId: 'proj_123' }
});
```

## API

### `new Noetfield({ apiKey, baseUrl?, timeout? })`

Construct a client. `apiKey` must start with `nf_live_`. Override `baseUrl` for self-hosted (default `https://api.noetfield.com`).

### `nf.verify(input): Promise<VerifyResult>`

Submit an artifact. Returns verdict, verdict_hash, gates, deploy_token (if pass), cost, receipt_url.

### `nf.getVerification(jobId): Promise<VerifyResult>`

Poll a verification job.

### `nf.getReceipt(verdictHash): Promise<ReceiptResponse>`

Fetch the full tamper-proof receipt by verdict hash. Receipts are public — share with auditors.

### `nf.verifyToken(deployToken, artifactHash): Promise<TokenVerification>`

Verify a deploy token before deploying. Returns `{ valid, expired, signatureValid, reason }`.

## Gates (G0-G7)

| Gate | Checks |
|---|---|
| G0 Provenance | Source is recognized (bolt/v0/cursor/custom) |
| G1 Policy | No direct prod DB URLs, no hardcoded secrets |
| G2 Credential | No AWS/GCP/Stripe/GitHub/Slack keys leaked |
| G3 License | SPDX identifier or license header present |
| G4 Transform Fidelity | No encoding corruption, balanced brackets |
| G5 Policy Immutability | Running policy hash matches stored hash |
| G6 Unordered Commit Lock | File ordering doesn't affect the hash |
| G7 Deploy Token | HMAC token bound to artifact hash, 15-min TTL |

## Errors

All errors are `NoetfieldError` with `.code` and `.status`:

```typescript
import { NoetfieldError } from '@noetfield/sdk';

try {
  await nf.verify({ artifact: '...', metadata: { projectId: 'x' } });
} catch (e) {
  if (e instanceof NoetfieldError) {
    console.log(e.code, e.status, e.message);
  }
}
```

## License

MIT © Noetfield Systems
