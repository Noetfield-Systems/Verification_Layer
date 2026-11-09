'use client'

/**
 * Integrations — expandable setup guides for Bolt, v0, Cursor,
 * GitHub Actions, and the Noetfield CLI.
 *
 * Each accordion item renders a short blurb + a CodeBlock with a copyable
 * snippet. Mono font + thin scrollbar via the CodeBlock component.
 */

import * as React from 'react'
import { Bolt, Github, Terminal, Wand2, MousePointerClick } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Card, CardContent } from '@/components/ui/card'
import { CodeBlock } from './code-block'
import { SectionHeader } from './section-header'

const BOLT_SNIPPET = `import { Noetfield } from '@noetfield/sdk'

const nf = new Noetfield({ apiKey: process.env.NOETFIELD_API_KEY })

const result = await nf.verify({
  artifact: boltOutput,
  artifactType: 'code',
  metadata: {
    source: 'bolt',
    projectId: 'proj_acme_platform',
  },
})

if (result.verdict !== 'pass') {
  throw new Error(\`Verification failed: \${result.verdict_hash}\`)
}

// Pass — safe to deploy.
console.log('Deploy token:', result.deploy_token)
`

const V0_SNIPPET = `import { Noetfield } from '@noetfield/sdk'

const nf = new Noetfield({ apiKey: process.env.NOETFIELD_API_KEY })

const result = await nf.verify({
  artifact: v0ComponentCode,
  artifactType: 'code',
  metadata: { source: 'v0', projectId: 'proj_acme_platform' },
})

if (result.verdict !== 'pass') throw new Error('Verification failed')
`

const CURSOR_SNIPPET = `import { Noetfield } from '@noetfield/sdk'

const nf = new Noetfield({ apiKey: process.env.NOETFIELD_API_KEY })

const result = await nf.verify({
  artifact: cursorOutput,
  artifactType: 'code',
  metadata: { source: 'cursor', projectId: 'proj_acme_platform' },
})

if (result.verdict !== 'pass') throw new Error('Verification failed')
`

const GHA_SNIPPET = `name: Noetfield Verify
on: [pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Verify with Noetfield
        uses: noetfield/verify-action@v1
        with:
          api-key: \${{ secrets.NOETFIELD_API_KEY }}
          artifact: ./src/
          block-on-fail: true
`

const CLI_SNIPPET = `# Install once
npm install -g @noetfield/cli

# Verify a directory or single file
noetfield verify ./my-project/ --api-key nf_live_xxx

# Pipe from any agent
agent-generate | noetfield verify --artifact-type code --source custom --api-key nf_live_xxx
`

export function IntegrationsView() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Integrations"
        description="Pipe AI-generated code through Noetfield before it reaches production."
      />

      <Card>
        <CardContent className="py-0">
          <Accordion type="single" collapsible defaultValue="bolt">
            <AccordionItem value="bolt">
              <AccordionTrigger>
                <Header icon={Bolt} title="Bolt" hint="Pipe your Bolt-generated code through Noetfield before deploying." />
              </AccordionTrigger>
              <AccordionContent>
                <p className="mb-3 text-sm text-muted-foreground">
                  Call <span className="noetfield-mono">nf.verify()</span> in your Bolt build step.
                  On <span className="nf-pass">PASS</span>, deploy. On <span className="nf-fail">FAIL</span>, halt.
                </p>
                <CodeBlock code={BOLT_SNIPPET} language="typescript" />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="v0">
              <AccordionTrigger>
                <Header icon={Wand2} title="v0" hint="Verify v0-generated components ship without leaked secrets." />
              </AccordionTrigger>
              <AccordionContent>
                <p className="mb-3 text-sm text-muted-foreground">
                  Same SDK, different <span className="noetfield-mono">source</span> tag.
                </p>
                <CodeBlock code={V0_SNIPPET} language="typescript" />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="cursor">
              <AccordionTrigger>
                <Header icon={MousePointerClick} title="Cursor" hint="Run every Cursor-generated artifact through the engine." />
              </AccordionTrigger>
              <AccordionContent>
                <p className="mb-3 text-sm text-muted-foreground">
                  Wire this into Cursor&apos;s post-generation hook or your team&apos;s review checklist.
                </p>
                <CodeBlock code={CURSOR_SNIPPET} language="typescript" />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="gha">
              <AccordionTrigger>
                <Header icon={Github} title="GitHub Action" hint="Block PRs that fail Noetfield verification." />
              </AccordionTrigger>
              <AccordionContent>
                <p className="mb-3 text-sm text-muted-foreground">
                  Drop this into <span className="noetfield-mono">.github/workflows/noetfield.yml</span>.
                </p>
                <CodeBlock code={GHA_SNIPPET} language="yaml" />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="cli">
              <AccordionTrigger>
                <Header icon={Terminal} title="CLI" hint="Verify any file or directory from the command line." />
              </AccordionTrigger>
              <AccordionContent>
                <p className="mb-3 text-sm text-muted-foreground">
                  Useful for local pre-commit hooks and ad-hoc checks.
                </p>
                <CodeBlock code={CLI_SNIPPET} language="bash" />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  )
}

function Header({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof Bolt
  title: string
  hint: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-md border border-border bg-secondary/40 p-2">
        <Icon className="size-4 text-emerald-500" />
      </div>
      <div className="text-left">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
    </div>
  )
}
