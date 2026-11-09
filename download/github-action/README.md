# Noetfield GitHub Action

Verify AI-generated artifacts on every PR. Blocks merge when verification fails.

## Setup

Add this to `.github/workflows/noetfield.yml` in your repo:

```yaml
name: Noetfield Verify
on: [pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
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
```

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `api-key` | yes | — | Noetfield API key (`nf_live_...`). Store as a secret. |
| `artifact` | yes | — | Path to file or directory to verify. |
| `project-id` | yes | — | Noetfield project ID. |
| `source` | no | `custom` | `bolt` / `v0` / `cursor` / `custom` |
| `artifact-type` | no | `code` | `code` / `workflow` / `config` |
| `recursive` | no | `true` | Include subdirectories (for directory artifacts). |
| `block-on-fail` | no | `true` | Fail the job when verification fails. |
| `base-url` | no | — | Override API base URL (for self-hosted). |

## Required secrets

In your repo settings → Secrets and variables → Actions, add:

- `NOETFIELD_API_KEY` — your `nf_live_...` API key
- `NOETFIELD_PROJECT_ID` — your project ID (visible in the Noetfield dashboard)

## Behavior

- On `pull_request`: runs the verification on the changed files.
- If `block-on-fail: true` (default), the job fails on FAIL verdict → branch protection blocks merge.
- The full gate breakdown is shown in the GitHub Actions log.
- The verdict hash + deploy token (if pass) are printed for downstream deploy jobs.

## Use the deploy token in a downstream deploy job

```yaml
jobs:
  verify:
    # ... as above
    outputs:
      deploy-token: ${{ steps.extract-token.outputs.token }}
  deploy:
    needs: verify
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Cloudflare
        env:
          NOETFIELD_TOKEN: ${{ needs.verify.outputs.deploy-token }}
        run: |
          # Cloudflare Worker checks the token via /api/v1/verify-token
          wrangler deploy --noetfield-token "$NOETFIELD_TOKEN"
```

## License

MIT © Noetfield Systems
