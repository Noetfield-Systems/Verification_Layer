# Fixing the github-actions[bot] Problem — Permanently

## The problem

When a GitHub Action (using the default `GITHUB_TOKEN`) creates a pull request, GitHub **intentionally prevents** that same `GITHUB_TOKEN` from approving the PR. This is a security feature: without it, any workflow with `pull-requests: write` permission could auto-approve its own PR and merge malicious code.

The result: your Noetfield verify Action runs on the PR, passes, but the PR sits there with "Needs approval" because `github-actions[bot]` can't approve its own work.

## Three fixes (pick one)

### Option A — Service Token (PAT) — simplest, recommended for solo/small team

Create a fine-grained Personal Access Token that belongs to a human (or a dedicated "approver" account), store it as a repo secret, and use it in a separate "approve" step.

**1. Create the PAT:**
- GitHub → Settings → Developer settings → Fine-grained personal access tokens
- Generate new token
- Resource owner: your org or user
- Repository access: select your repo
- Permissions → Repository permissions → **Pull requests: Read and write**
- Expiration: 90 days (rotate quarterly)

**2. Add as a repo secret:**
- Repo → Settings → Secrets and variables → Actions → New repository secret
- Name: `APPROVE_TOKEN`
- Value: the PAT

**3. Workflow YAML** (`.github/workflows/noetfield-verify.yml`):

```yaml
name: Noetfield Verify + Auto-Approve
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  verify:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4

      - name: Verify with Noetfield
        uses: noetfield/verify-action@v1
        with:
          api-key: ${{ secrets.NOETFIELD_API_KEY }}
          artifact: ./src/
          project-id: ${{ secrets.NOETFIELD_PROJECT_ID }}
          source: cursor
          recursive: true
          block-on-fail: true

      # Only auto-approve if the verify step passed (this step only runs on success)
      - name: Auto-approve PR
        if: success()
        env:
          GH_TOKEN: ${{ secrets.APPROVE_TOKEN }}
        run: |
          gh pr review ${{ github.event.pull_request.number }} --approve \
            --body "Auto-approved: Noetfield verification passed (G0-G7)."

      - name: Enable auto-merge
        if: success()
        env:
          GH_TOKEN: ${{ secrets.APPROVE_TOKEN }}
        run: |
          gh pr merge ${{ github.event.pull_request.number }} --auto --squash \
            --body "Merged after Noetfield verification passed."
```

**Why this works:** The verify step uses `GITHUB_TOKEN` (safe — it can't approve). The approve step uses `APPROVE_TOKEN` (a human-scoped PAT — it CAN approve). The two are separate principals, so GitHub's self-approval block doesn't trigger.

### Option B — GitHub App — recommended for orgs/teams

A GitHub App is a first-class principal with its own identity. It can approve PRs created by `GITHUB_TOKEN` because they're different actors.

**1. Create the App:**
- GitHub → Settings → Developer settings → GitHub Apps → New GitHub App
- Name: `noetfield-approver`
- Repository permissions → **Pull requests: Read & write**
- Install it on your repo

**2. Store the App ID + Private Key as secrets:**
- `APPROVER_APP_ID` — the numeric app ID
- `APPROVER_APP_PRIVATE_KEY` — the PEM private key

**3. Workflow YAML:**

```yaml
name: Noetfield Verify + App-Approve
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  verify:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4

      - name: Verify with Noetfield
        uses: noetfield/verify-action@v1
        with:
          api-key: ${{ secrets.NOETFIELD_API_KEY }}
          artifact: ./src/
          project-id: ${{ secrets.NOETFIELD_PROJECT_ID }}
          block-on-fail: true

      # Mint an installation access token for the GitHub App
      - name: Get app token
        id: app-token
        uses: actions/create-github-app-token@v1
        with:
          app-id: ${{ secrets.APPROVER_APP_ID }}
          private-key: ${{ secrets.APPROVER_APP_PRIVATE_KEY }}

      - name: Approve PR as the App
        if: success()
        env:
          GH_TOKEN: ${{ steps.app-token.outputs.token }}
        run: |
          gh pr review ${{ github.event.pull_request.number }} --approve \
            --body "Approved by noetfield-approver (GitHub App): G0-G7 passed."

      - name: Auto-merge
        if: success()
        env:
          GH_TOKEN: ${{ steps.app-token.outputs.token }}
        run: |
          gh pr merge ${{ github.event.pull_request.number }} --auto --squash
```

**Why this works:** The GitHub App is a separate principal from the `GITHUB_TOKEN`. The App's approval counts as a real review. Audit log shows "approved by noetfield-approver[bot]" — clearly attributable.

### Option C — Branch Protection only (no approval) — simplest, weakest

Drop required reviews entirely for bot PRs. Rely on the Noetfield verify Action as the sole gate via required status checks.

**1. Branch protection rule** (repo → Settings → Branches → Add rule):
- Branch name pattern: `main`
- ✅ Require status checks to pass before merging
- Required status checks: `Verify with Noetfield` (the job name from your workflow)
- ❌ Require pull request reviews before merging — UNCHECK this
- ✅ Require branches to be up to date before merging

**2. Workflow YAML** (no approve step needed):

```yaml
name: Noetfield Verify
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  verify:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - name: Verify with Noetfield
        uses: noetfield/verify-action@v1
        with:
          api-key: ${{ secrets.NOETFIELD_API_KEY }}
          artifact: ./src/
          project-id: ${{ secrets.NOETFIELD_PROJECT_ID }}
          block-on-fail: true
```

**Why this works:** No approval needed because there's no required review. The Noetfield verify check becomes the merge gate. If it fails, merge is blocked. If it passes, merge is allowed.

**Trade-off:** No human review. Use this only if you trust the Noetfield gates to catch everything (they catch: leaked secrets, prod DB URLs, missing licenses, encoding corruption, policy tampering — but NOT business logic bugs).

## Which to pick

| Approach | Setup | Audit trail | Best for |
|---|---|---|---|
| A — PAT | 5 min | "approved by sina" | Solo / small team |
| B — GitHub App | 15 min | "approved by noetfield-approver[bot]" | Org / team |
| C — Branch protection only | 2 min | none (no reviews) | Trusted internal automation |

**Recommended: Option B** (GitHub App). It's the most defensible for regulated industries — the approver is a named principal with its own audit trail, and you can rotate the key without rotating a human's PAT.

## Common mistake to avoid

Do NOT try to make the `GITHUB_TOKEN` approve by giving it `pull-requests: write` permission. GitHub explicitly blocks this:

```
{"message": "Reviews may only be requested from collaborators.",
 "documentation_url": "https://docs.github.com/rest/pulls/reviews"}
```

This is by design. Use a separate principal (PAT or App).

## Verifying the fix

After applying any option, open a test PR. The expected behavior:

1. PR opened → Noetfield verify Action runs
2. Verify passes → approve step runs (Options A/B) or merge is unblocked (Option C)
3. PR auto-merges (if you enabled auto-merge)
4. Audit log shows the approver identity

If the verify Action **fails** (block-on-fail: true), the approve step does NOT run, merge is blocked. That's the contract.
