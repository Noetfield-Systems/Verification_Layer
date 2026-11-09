# @noetfield/cli

> Noetfield CLI — verify AI-generated artifacts from the command line.

## Install

```bash
npm install -g @noetfield/cli
# or
bun add -g @noetfield/cli
```

## Quick start

```bash
# Set your API key
export NOETFIELD_API_KEY=nf_live_...
export NOETFIELD_PROJECT_ID=proj_123

# Verify a file
noetfield verify ./my-code.py

# Verify a directory recursively
noetfield verify ./my-project/ --recursive

# Block CI on failure
noetfield verify ./src/ --recursive --block-on-fail
```

## Commands

### `noetfield verify <file-or-dir>`

Verify a single file or a directory of files.

```bash
noetfield verify ./handler.ts --api-key nf_live_... --project-id proj_123 --source cursor
noetfield verify ./src/ --recursive --block-on-fail
```

Options:
- `--api-key <key>` — API key (or `NOETFIELD_API_KEY` env var)
- `--project-id <id>` — Project ID (or `NOETFIELD_PROJECT_ID` env var)
- `--source <s>` — `bolt` | `v0` | `cursor` | `custom` (default: `custom`)
- `--artifact-type <t>` — `code` | `workflow` | `config` (default: `code`)
- `--recursive, -r` — For directories: include subdirectories
- `--block-on-fail` — Exit code 1 on FAIL (for CI usage)
- `--base-url <url>` — Override API base URL

### `noetfield token-check <token> <artifact_hash>`

Verify a deploy token before deploying an artifact. Use from your deploy scripts:

```bash
noetfield token-check nf_tok_1.1794217856.a396... sha256:db4f4f19...
```

### `noetfield receipt <verdict_hash>`

Fetch the tamper-proof receipt for a verification. Public — no API key required:

```bash
noetfield receipt sha256:db4f4f199ad48c5e4ba6e90dd4749e30605d980433488c413593c15f5d613645
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Verification passed (or token valid) |
| 1 | Verification failed (or token invalid) |
| 2 | Usage error |

## License

MIT © Noetfield Systems
