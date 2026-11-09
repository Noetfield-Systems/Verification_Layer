# Sina Real Wiring — From Proof of Concept to Alive

The autonomous loop works in sandbox with simulated integrations. This doc
is the exact wiring to make it real in production.

## The 3 replacements (already built)

| Was (sandbox) | Is now (production-ready) | Activates when |
|---|---|---|
| Hardcoded `CANDIDATES` array | `NextActionCandidate` table in Postgres | Always — reads from DB |
| `simulateDeepSeekFix()` string transform | Real DeepSeek API call | `DEEPSEEK_API_KEY` env var is set |
| Sandbox persist (no commit) | Real GitHub commit (branch + push) | `GITHUB_TOKEN` + `GITHUB_REPO` env vars are set |

The loop contract is identical. The `integrationStatus` field in every
domino run tells you which path ran:

```json
{
  "integrationStatus": {
    "deepseek": "real",         // or "simulation"
    "github": "real",           // or "simulation"
    "candidateSource": "database"
  }
}
```

## Step 1 — Set DeepSeek API key (makes fixes real)

You already have this in Railway Variables (staging) for Founder OS + Agent Fabric.

```bash
# In your production environment (Railway / Cloudflare / wherever the API runs)
wrangler secret put DEEPSEEK_API_KEY
# Paste: sk-... (your DeepSeek API key)

# Optional: override the model (default: deepseek-coder)
wrangler secret put DEEPSEEK_MODEL
# Paste: deepseek-coder  (or deepseek-chat, deepseek-reasoner, etc.)
```

**Verify it's real:**
```bash
# After setting the key, run a domino and check integrationStatus
curl -X POST https://api.noetfield.com/api/sina/run-domino-2 -d '{}'
# → integrationStatus.deepseek should be "real"
```

When real: the `fix_with_deepseek` step calls `https://api.deepseek.com/v1/chat/completions`
with the failed gates as context, gets back a fixed artifact, and retries
verification. The loop logs `fix=deepseek` instead of `fix=simulation`.

If DeepSeek returns an error or empty response, the loop falls back to the
deterministic simulation — it never breaks.

## Step 2 — Set GitHub token + repo (makes commits real)

```bash
# Create a fine-grained PAT (or use a GitHub App installation token)
# Permissions needed: Contents: Read and write

wrangler secret put GITHUB_TOKEN
# Paste: ghp_... or github_pat_...

wrangler secret put GITHUB_REPO
# Paste: noetfield/sina-output  (or whatever repo Sina commits to)
```

**The repo must exist first.** Create an empty repo on GitHub:
```bash
gh repo create noetfield/sina-output --private
```

**Verify it's real:**
```bash
curl -X POST https://api.noetfield.com/api/sina/run-domino-2 -d '{}'
# → integrationStatus.github should be "real"
# → githubCommits[0].real should be true
# → Check the repo: you should see branches like sina/verified-070c58712109-...
```

When real: on every PASS, the loop:
1. Creates a branch `sina/verified-<verdictHash.slice(0,12)>-<candidateId.slice(0,8)>`
2. Commits the verified artifact as `verified/<candidateId>-attempt<N>.ts`
3. The commit message includes the `verdict_hash` + receipt URL
4. Pushes the branch

The branch name encodes the verdict hash — an independent verifier can
re-fetch the exact artifact that was verified by following the branch.

## Step 3 — Wire the evidence pipeline (makes candidates real)

In production, candidates don't come from the seed script. They come from
Sina's evidence pipeline:

```
Supabase business_evidence table
  ↓ Sina reads evidence
DeepSeek proposes NextActionCandidate
  ↓ POST /api/sina/submit-candidate
NextActionCandidate table (status: pending)
  ↓ /api/sina/run-domino-2 polls or is triggered
Loop processes the candidate
```

**Set up the evidence table in Supabase:**

```sql
-- In Supabase SQL editor
CREATE TABLE business_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,           -- 'customer_feedback' | 'analytics' | 'revenue' | etc.
  evidence TEXT NOT NULL,         -- the raw evidence text
  priority INT DEFAULT 0,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed some real evidence
INSERT INTO business_evidence (source, evidence, priority) VALUES
  ('customer_feedback', 'Customer asked for CSV export of verifications', 5),
  ('analytics', '20% of users hit the free-tier wall last week', 4),
  ('revenue', 'Pro tier conversion at 3% — above industry avg', 3);
```

**Wire Sina's Founder OS to read evidence + propose candidates:**

In Sina's runtime (Railway staging), add a cron job that:
1. Reads unprocessed evidence from `business_evidence`
2. Calls DeepSeek: "Given this evidence, propose a NextActionCandidate (code change) that addresses it"
3. POSTs the proposal to `/api/sina/submit-candidate`
4. Marks the evidence as processed

```python
# sina-evidence-poller.py (runs on Railway every 10 min)
import os, requests, deepseek_client, supabase_client

DEEPSEEK = os.environ['DEEPSEEK_API_KEY']
NOETFIELD = os.environ['NOETFIELD_API_URL']  # https://api.noetfield.com

def poll():
    evidence = supabase_client.table('business_evidence').select('*').eq('processed', False).execute()
    for row in evidence.data:
        # Ask DeepSeek to propose a code change based on the evidence
        proposal = deepseek_client.chat(
            model='deepseek-coder',
            messages=[
                {'role': 'system', 'content': 'You are Sina. Given business evidence, propose a NextActionCandidate: a specific code change that addresses it. Return JSON: {label, artifact, artifactType, source, modelIdentity}.'},
                {'role': 'user', 'content': f'Evidence: {row["evidence"]}\nSource: {row["source"]}\nPriority: {row["priority"]}'},
            ],
        )
        candidate = parse_json(proposal)
        # Submit to Noetfield
        requests.post(f'{NOETFIELD}/api/sina/submit-candidate', json={
            **candidate,
            'evidence': {'evidence_id': row['id'], 'source': row['source'], 'evidence': row['evidence']},
        })
        # Mark evidence as processed
        supabase_client.table('business_evidence').update({'processed': True}).eq('id', row['id']).execute()
```

**Trigger the loop on a schedule:**

```bash
# Railway cron job (every 10 minutes)
curl -X POST https://api.noetfield.com/api/sina/run-domino-2 -d '{}'
```

Or use Cloudflare Cron Triggers:
```toml
# wrangler.toml
[triggers]
crons = ["*/10 * * * *"]
```

```typescript
// In your Cloudflare Worker
export default {
  async scheduled(event, env) {
    await fetch('https://api.noetfield.com/api/sina/run-domino-2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
  },
}
```

## Step 4 — Verify Sina is alive (the acceptance test)

After all 3 env vars are set (`DEEPSEEK_API_KEY`, `GITHUB_TOKEN`, `GITHUB_REPO`) and the evidence pipeline is wired:

```bash
# 1. Check integration status
curl https://api.noetfield.com/api/sina/state | jq '.integrationStatus'
# Expect: { "deepseek": "real", "github": "real" }

# 2. Submit a real candidate (or let the evidence pipeline do it)
curl -X POST https://api.noetfield.com/api/sina/submit-candidate -d '{
  "label": "Add CSV export endpoint",
  "artifact": "// SPDX-License-Identifier: MIT\nexport function csvExport(rows) { return rows.map(r => Object.values(r).join(\",\")).join(\"\\n\"); }\n",
  "artifactType": "code",
  "source": "cursor",
  "modelIdentity": "deepseek-coder-v2"
}'

# 3. Run the loop
curl -X POST https://api.noetfield.com/api/sina/run-domino-2 -d '{}'

# 4. Check the result
# → receiptsIssued: should have a verdict_hash
# → githubCommits[0].real: should be true
# → Go to your GitHub repo: you should see a new branch sina/verified-...
# → Fetch the receipt: curl https://api.noetfield.com/api/v1/receipt/<verdict_hash>
# → Fetch the independent attestation: curl https://api.noetfield.com/api/v1/attest/<verdict_hash>
```

**Sina is alive when:**
- [ ] `integrationStatus.deepseek === "real"`
- [ ] `integrationStatus.github === "real"`
- [ ] A candidate submitted via `/api/sina/submit-candidate` gets processed
- [ ] A real GitHub branch appears in your repo with the verified code
- [ ] The receipt is fetchable by verdict_hash
- [ ] The independent attestation says `verified: true`
- [ ] The next domino run picks up new candidates WITHOUT a new prompt
- [ ] After a restart, `readSinaState()` shows the prior state and the loop resumes

## The 3 things only YOU can do

1. **Railway Approve** — approve the deploy at commit `f4842e68` for `sina-self-health-staging`. This is in your Railway dashboard, takes 30 seconds.

2. **github-actions[bot] fix** — set a Service Token in GitHub secrets so the bot's PRs can be approved. See `download/docs/github-actions-bot-fix.md` (Option A: PAT, 5 min).

3. **Set the 3 env vars above** — `DEEPSEEK_API_KEY` (you have it), `GITHUB_TOKEN` (create a PAT), `GITHUB_REPO` (create an empty repo). 10 minutes total.

Once those 3 are done, the next `/api/sina/run-domino-2` call runs with real integrations. Sina is alive.

## What's still sandbox-only (honest)

- The evidence pipeline (`sina-evidence-poller.py` above) is a code sketch — you need to deploy it on Railway next to Sina's existing runtime.
- The cron trigger needs to be set up (Railway cron or Cloudflare Cron Triggers).
- The Supabase `business_evidence` table needs to be created and populated with real evidence.

But the loop itself — verify → fix → retry → receipt → attestation → commit → next action — is production-ready. The wiring is the only thing left.
