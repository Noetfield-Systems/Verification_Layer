/**
 * DeepSeek integration — real API call for code-fix proposals.
 *
 * When DEEPSEEK_API_KEY is set: calls the real DeepSeek chat completions
 * API to fix code that failed Noetfield gates.
 *
 * When DEEPSEEK_API_KEY is NOT set: falls back to a deterministic string
 * transform (the same simulateDeepSeekFix that was hardcoded before).
 *
 * The contract is identical either way: (artifact, failedGates) → fixedArtifact.
 * The loop doesn't know or care which path ran.
 *
 * In production, set DEEPSEEK_API_KEY in Railway Variables (you already have
 * it set for Founder OS + Agent Fabric staging).
 */

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-coder'

export function hasDeepSeekKey(): boolean {
  const k = process.env.DEEPSEEK_API_KEY
  return !!k && k.length > 10 && k.startsWith('sk-')
}

/**
 * Ask DeepSeek to fix an artifact that failed verification gates.
 * Returns the fixed artifact string.
 *
 * If DEEPSEEK_API_KEY is not set, falls back to the deterministic simulation.
 */
export async function fixArtifactWithDeepSeek(
  artifact: string,
  failedGates: string[],
  candidateLabel?: string,
): Promise<{ fixedArtifact: string; usedRealDeepSeek: boolean; reasoning?: string }> {
  if (!hasDeepSeekKey()) {
    return {
      fixedArtifact: simulateDeepSeekFix(artifact, failedGates),
      usedRealDeepSeek: false,
    }
  }
  return realDeepSeekFix(artifact, failedGates, candidateLabel)
}

async function realDeepSeekFix(
  artifact: string,
  failedGates: string[],
  candidateLabel?: string,
): Promise<{ fixedArtifact: string; usedRealDeepSeek: boolean; reasoning?: string }> {
  const systemPrompt = `You are a code verification fixer. The user will give you code that failed automated verification gates. Your job is to return ONLY the fixed code — no explanation, no markdown fences, no commentary. The fix must make the code pass the listed gates.

Common gate failures and their fixes:
- G1 Policy (hardcoded secrets / prod DB URLs): remove the lines containing hardcoded credentials. Replace with environment variable reads (process.env.X). Never commit real connection strings.
- G2 Credential (leaked AWS/GCP/Stripe/GitHub keys): remove any line containing AKIA..., sk_live_..., ghp_..., xox..., AIza... patterns. Read credentials from env vars instead.
- G3 License (missing SPDX identifier): prepend "// SPDX-License-Identifier: MIT" and "// Copyright (c) 2026 [company]" as the first two lines.
- G4 Transform Fidelity (encoding corruption / bracket imbalance): fix the corrupted characters, balance the brackets.

Return ONLY the fixed code. No markdown fences. No explanation.`

  const userPrompt = `Candidate: ${candidateLabel || 'unnamed'}

Failed gates:
${failedGates.map((g) => `- ${g}`).join('\n')}

Original code:
\`\`\`
${artifact}
\`\`\`

Return the fixed code that passes all gates. ONLY the code, nothing else.`

  try {
    const resp = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2, // low — we want deterministic fixes
        max_tokens: 4096,
        stream: false,
      }),
    })
    if (!resp.ok) {
      const errText = await resp.text()
      console.error(`[deepseek] API error ${resp.status}: ${errText.slice(0, 200)}`)
      // Fall back to simulation on API error — the loop must not break.
      return {
        fixedArtifact: simulateDeepSeekFix(artifact, failedGates),
        usedRealDeepSeek: false,
        reasoning: `DeepSeek API error ${resp.status}, fell back to simulation`,
      }
    }
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) {
      return {
        fixedArtifact: simulateDeepSeekFix(artifact, failedGates),
        usedRealDeepSeek: false,
        reasoning: 'DeepSeek returned empty content, fell back to simulation',
      }
    }
    // Strip markdown code fences if DeepSeek wrapped the output
    const cleaned = content
      .replace(/^```[\w]*\n?/, '')
      .replace(/\n?```$/, '')
      .trim()
    return {
      fixedArtifact: cleaned,
      usedRealDeepSeek: true,
      reasoning: `DeepSeek (${DEEPSEEK_MODEL}) proposed a fix for: ${failedGates.join(', ')}`,
    }
  } catch (e) {
    console.error(`[deepseek] network error:`, (e as Error).message)
    return {
      fixedArtifact: simulateDeepSeekFix(artifact, failedGates),
      usedRealDeepSeek: false,
      reasoning: `DeepSeek network error: ${(e as Error).message}`,
    }
  }
}

/**
 * Deterministic simulation of a DeepSeek fix.
 * Used when no API key is set, or when the API call fails.
 *
 * Applies rule-based transforms matching the gate failure:
 * - G2 → strip lines with leaked credential patterns
 * - G1 → strip lines with hardcoded prod DB URLs / secret assignments
 * - G3 → prepend SPDX header if missing
 */
function simulateDeepSeekFix(artifact: string, failedGates: string[]): string {
  let fixed = artifact
  if (failedGates.some((g) => g.startsWith('G2'))) {
    fixed = fixed
      .split('\n')
      .filter((line) => !/AKIA|aws_secret_access_key|sk_live_|ghp_|xox|AIza/.test(line))
      .join('\n')
  }
  if (failedGates.some((g) => g.startsWith('G1'))) {
    fixed = fixed
      .split('\n')
      .filter((line) => !/postgres:\/\/|mongodb:\/\/|mysql:\/\/|DB_PASSWORD|DATABASE_PASSWORD/.test(line))
      .join('\n')
  }
  if (failedGates.some((g) => g.startsWith('G3'))) {
    if (!/SPDX-License-Identifier/.test(fixed)) {
      fixed = `// SPDX-License-Identifier: MIT\n// Copyright (c) 2026 Acme Corp\n${fixed}`
    }
  }
  return fixed
}
