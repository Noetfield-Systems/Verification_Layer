# noetfield (Python SDK)

> Cryptographic proof that your AI agent's code is safe to deploy.

Official Python SDK for the [Noetfield Verification Layer](https://noetfield.com).

## Install

```bash
pip install noetfield
```

## Quick start

```python
from noetfield import Client

nf = Client(api_key="nf_live_...")

result = nf.verify(
    artifact=code_string,
    artifact_type="code",
    metadata={"source": "cursor", "project_id": "proj_123"},
)

if result.verdict == "pass":
    print(f"Deploy token: {result.deploy_token}")
    # Deploy to Cloudflare/Railway/AWS with the token
else:
    failed = [g for g in result.gates if not g.passed]
    print(f"Failed gates: {[g.name for g in failed]}")
```

## Context manager

```python
from noetfield import Client

with Client(api_key="nf_live_...") as nf:
    result = nf.verify(artifact=code, project_id="proj_123", source="bolt")
```

## Verify a deploy token (infrastructure side)

```python
from noetfield import Client

nf = Client(api_key="nf_live_...")
check = nf.verify_token(deploy_token, artifact_hash)
if not check.valid:
    raise RuntimeError(f"Deploy blocked: {check.reason}")
```

## Multi-file artifacts

```python
result = nf.verify(
    artifact={
        "src/handler.ts": "// SPDX-License-Identifier: MIT\nexport function handler() {}",
        "README.md": "# My module",
    },
    artifact_type="code",
    project_id="proj_123",
    source="v0",
)
```

## API

### `Client(api_key, base_url=None, timeout=30)`

Construct a client. `api_key` must start with `nf_live_`.

### `nf.verify(artifact, artifact_type="code", metadata=None, project_id=None, source="custom", model_identity=None)`

Submit an artifact. Returns `VerifyResult`.

### `nf.get_verification(job_id)`

Poll a verification job.

### `nf.get_receipt(verdict_hash)`

Fetch the full tamper-proof receipt. Public endpoint.

### `nf.verify_token(deploy_token, artifact_hash)`

Verify a deploy token before deploying. Returns `TokenVerification`.

## Gates (G0-G7)

| Gate | Checks |
|---|---|
| G0 Provenance | Source recognized (bolt/v0/cursor/custom) |
| G1 Policy | No direct prod DB URLs, no hardcoded secrets |
| G2 Credential | No AWS/GCP/Stripe/GitHub/Slack keys |
| G3 License | SPDX identifier or license header |
| G4 Transform Fidelity | No encoding corruption, balanced brackets |
| G5 Policy Immutability | Policy hash matches stored hash |
| G6 Unordered Commit Lock | File ordering doesn't affect hash |
| G7 Deploy Token | HMAC token bound to artifact hash, 15-min TTL |

## License

MIT © Noetfield Systems
