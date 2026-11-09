/**
 * GitHub integration — real commit on PASS.
 *
 * When GITHUB_TOKEN + GITHUB_REPO are set: creates a real branch, commits
 * the verified code, and pushes it to the repo.
 *
 * When they're not set: simulates the commit (returns a fake branch name +
 * SHA + URL) so the loop contract holds in sandbox.
 *
 * The branch name encodes the verdict hash so an independent verifier can
 * re-fetch the exact artifact that was verified.
 *
 * In production:
 *   GITHUB_TOKEN = a PAT with `repo` scope, OR a GitHub App installation token
 *   GITHUB_REPO  = "owner/repo" (e.g. "noetfield/sina-output")
 */

export function hasGitHubConfig(): boolean {
  const t = process.env.GITHUB_TOKEN
  const r = process.env.GITHUB_REPO
  return !!t && t.length > 10 && !!r && r.includes('/')
}

export interface CommitResult {
  branch: string
  commitSha: string
  url: string
  usedRealGitHub: boolean
  message: string
}

/**
 * Commit verified code to GitHub. Called only after PASS.
 *
 * `artifact` is the exact code that was verified (after any DeepSeek fixes).
 * `verdictHash` is the deterministic hash — the branch name includes it so
 * the commit is cryptographically linked to the verification receipt.
 */
export async function commitVerifiedCode(args: {
  artifact: string
  verdictHash: string
  candidateLabel: string
  candidateId: string
  attempt: number
  artifactType: 'code' | 'workflow' | 'config'
}): Promise<CommitResult> {
  const branchName = buildBranchName(args.verdictHash, args.candidateId)
  const fileName = buildFileName(args.candidateId, args.artifactType, args.attempt)
  const commitMessage = buildCommitMessage(args)

  if (!hasGitHubConfig()) {
    return {
      branch: branchName,
      commitSha: 'simulated_' + args.verdictHash.slice(7, 19),
      url: `https://github.com/(simulated)/${branchName}`,
      usedRealGitHub: false,
      message: `[simulated] would commit ${fileName} to branch ${branchName}`,
    }
  }
  return realGitHubCommit(args, branchName, fileName, commitMessage)
}

function buildBranchName(verdictHash: string, candidateId: string): string {
  const hashSlice = verdictHash.replace(/^sha256:/, '').slice(0, 12)
  return `sina/verified-${hashSlice}-${candidateId.slice(0, 8)}`
}

function buildFileName(candidateId: string, artifactType: string, attempt: number): string {
  const ext =
    artifactType === 'code' ? 'ts' : artifactType === 'workflow' ? 'yml' : 'json'
  return `verified/${candidateId}-attempt${attempt}.${ext}`
}

function buildCommitMessage(args: {
  candidateLabel: string
  verdictHash: string
  attempt: number
}): string {
  return [
    `sina: verified ${args.candidateLabel}`,
    '',
    `verdict_hash: ${args.verdictHash}`,
    `attempt: ${args.attempt}`,
    `verified_by: noetfield-engine-v1`,
    `receipt: /api/v1/receipt/${args.verdictHash}`,
    '',
    `This commit was created by Sina's autonomous loop after the artifact`,
    `passed all G0-G7 verification gates. The verdict_hash above is the`,
    `cryptographic fingerprint — fetch the receipt to verify independently.`,
  ].join('\n')
}

async function realGitHubCommit(
  args: {
    artifact: string
    verdictHash: string
    candidateLabel: string
    candidateId: string
    attempt: number
    artifactType: 'code' | 'workflow' | 'config'
  },
  branchName: string,
  fileName: string,
  commitMessage: string,
): Promise<CommitResult> {
  const repo = process.env.GITHUB_REPO! // confirmed by hasGitHubConfig
  const token = process.env.GITHUB_TOKEN!
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  try {
    // 1. Get the default branch's latest commit SHA
    const repoResp = await fetch(`https://api.github.com/repos/${repo}`, { headers })
    if (!repoResp.ok) {
      throw new Error(`repo fetch ${repoResp.status}: ${await repoResp.text()}`)
    }
    const repoData = (await repoResp.json()) as { default_branch: string }
    const defaultBranch = repoData.default_branch

    // 2. Get the SHA of the default branch head
    const refResp = await fetch(
      `https://api.github.com/repos/${repo}/git/refs/heads/${defaultBranch}`,
      { headers },
    )
    if (!refResp.ok) {
      throw new Error(`ref fetch ${refResp.status}: ${await refResp.text()}`)
    }
    const refData = (await refResp.json()) as { object: { sha: string } }
    const baseSha = refData.object.sha

    // 3. Create the new branch from the base SHA
    const createBranchResp = await fetch(
      `https://api.github.com/repos/${repo}/git/refs`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: baseSha,
        }),
      },
    )
    if (createBranchResp.status === 422) {
      // Branch already exists — that's fine, we'll just add the commit to it
    } else if (!createBranchResp.ok) {
      throw new Error(`branch create ${createBranchResp.status}: ${await createBranchResp.text()}`)
    }

    // 4. Create the blob (file content)
    const blobResp = await fetch(`https://api.github.com/repos/${repo}/git/blobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: args.artifact,
        encoding: 'utf-8',
      }),
    })
    if (!blobResp.ok) {
      throw new Error(`blob create ${blobResp.status}: ${await blobResp.text()}`)
    }
    const blobData = (await blobResp.json()) as { sha: string }
    const blobSha = blobData.sha

    // 5. Get the base commit's tree SHA
    const commitResp = await fetch(
      `https://api.github.com/repos/${repo}/git/commits/${baseSha}`,
      { headers },
    )
    if (!commitResp.ok) {
      throw new Error(`commit fetch ${commitResp.status}: ${await commitResp.text()}`)
    }
    const commitData = (await commitResp.json()) as { tree: { sha: string } }
    const baseTreeSha = commitData.tree.sha

    // 6. Create a new tree with the file added
    const treeResp = await fetch(`https://api.github.com/repos/${repo}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: [
          {
            path: fileName,
            mode: '100644',
            type: 'blob',
            sha: blobSha,
          },
        ],
      }),
    })
    if (!treeResp.ok) {
      throw new Error(`tree create ${treeResp.status}: ${await treeResp.text()}`)
    }
    const treeData = (await treeResp.json()) as { sha: string }
    const newTreeSha = treeData.sha

    // 7. Create the commit
    const newCommitResp = await fetch(`https://api.github.com/repos/${repo}/git/commits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: commitMessage,
        tree: newTreeSha,
        parents: [baseSha],
      }),
    })
    if (!newCommitResp.ok) {
      throw new Error(`commit create ${newCommitResp.status}: ${await newCommitResp.text()}`)
    }
    const newCommitData = (await newCommitResp.json()) as { sha: string }
    const newCommitSha = newCommitData.sha

    // 8. Update the branch ref to point at the new commit
    const updateRefResp = await fetch(
      `https://api.github.com/repos/${repo}/git/refs/heads/${branchName}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ sha: newCommitSha }),
      },
    )
    if (!updateRefResp.ok) {
      throw new Error(`ref update ${updateRefResp.status}: ${await updateRefResp.text()}`)
    }

    return {
      branch: branchName,
      commitSha: newCommitSha,
      url: `https://github.com/${repo}/tree/${branchName}`,
      usedRealGitHub: true,
      message: `committed ${fileName} to ${branchName} (${newCommitSha.slice(0, 7)})`,
    }
  } catch (e) {
    console.error(`[github] real commit failed:`, (e as Error).message)
    // Fall back to simulation — the loop must not break on a GitHub error
    return {
      branch: branchName,
      commitSha: 'fallback_' + args.verdictHash.slice(7, 19),
      url: `https://github.com/${repo}/tree/${branchName} (commit failed — see logs)`,
      usedRealGitHub: false,
      message: `GitHub commit failed (${(e as Error).message}), fell back to simulation`,
    }
  }
}
