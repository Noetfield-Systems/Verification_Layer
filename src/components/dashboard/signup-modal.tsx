'use client'

/**
 * Signup modal — the conversion funnel.
 *
 * Flow:
 *   1. User clicks "Start Verifying" on the landing page.
 *   2. Modal opens with an email input.
 *   3. POST /api/signup emails a one-time code; PUT confirms it.
 *   4. Only a verified mailbox receives an API key, shown ONCE with a copy button + a ready-to-paste curl
 *      command + a "Open Dashboard" button.
 *
 * No password, no login, no friction. Email → key → start verifying.
 */

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Mail, KeyRound, Copy, Check, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import { useDashboardStore } from '@/lib/dashboard-store'

interface SignupModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional callback after a successful signup. The dashboard store's
   * completeSignup is called regardless — this is for extra side effects. */
  onSuccess?: (apiKey: string, projectId: string) => void
}

interface SignupResponse {
  api_key: string
  key_id: string
  project_id: string
  project_slug: string
  user_email: string
  free_tier_limit: number
  curl_example: string
  verify_endpoint: string
  docs_url: string
}

export function SignupModal({ open, onOpenChange, onSuccess }: SignupModalProps) {
  const [email, setEmail] = React.useState('')
  const [companyName, setCompanyName] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<SignupResponse | null>(null)
  const [verificationPending, setVerificationPending] = React.useState(false)
  const [code, setCode] = React.useState('')
  const completeSignup = useDashboardStore((s) => s.completeSignup)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Email is required.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), companyName: companyName.trim() || undefined }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setError(data?.error?.message || 'Signup failed.')
        return
      }
      setVerificationPending(true)
      toast({ title: 'Verification email sent', description: 'Enter the six-digit code from your inbox.' })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const onConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('/api/signup', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      })
      const data = await resp.json()
      if (!resp.ok) { setError(data?.error?.message || 'Verification failed'); return }
      setResult(data as SignupResponse)
      toast({ title: 'Email verified', description: 'Your API key is ready. Copy it now.' })
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }

  const onCopyKey = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result.api_key)
    toast({ title: 'Copied', description: 'API key copied to clipboard.' })
  }

  const onCopyCurl = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result.curl_example)
    toast({ title: 'Copied', description: 'curl command copied.' })
  }

  const reset = () => {
    setEmail('')
    setCompanyName('')
    setError(null)
    setResult(null)
    setVerificationPending(false)
    setCode('')
    setLoading(false)
  }

  const onClose = () => {
    onOpenChange(false)
    // Don't reset result immediately — user might want to copy the key after closing
    setTimeout(reset, 300)
  }

  const onEnterDashboard = () => {
    if (!result) return
    // Cache the key + project, then flip into the dashboard — all in one
    // store action. The dashboard reads signedUpProjectId to scope queries.
    completeSignup(result.api_key, result.project_id)
    if (onSuccess) onSuccess(result.api_key, result.project_id)
    // Close + reset the modal after the store has flipped.
    onOpenChange(false)
    setTimeout(reset, 300)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl shadow-emerald-950/40"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">
                  {result ? 'Your API key is ready' : verificationPending ? 'Verify your email' : 'Start verifying — free'}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {result ? 'Copy it now — it won\'t be shown again.' : verificationPending ? 'Enter the 6-digit code from your inbox.' : '100 verifications / month. No credit card.'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5">
              {!result && verificationPending ? (
                <form onSubmit={onConfirm} className="space-y-4">
                  <label htmlFor="signup-code" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Email verification code</label>
                  <Input id="signup-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
                  {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
                  <Button type="submit" disabled={loading || code.length !== 6} className="w-full bg-emerald-500 text-emerald-950 hover:bg-emerald-400">{loading ? 'Verifying…' : 'Verify email & create key'}</Button>
                  <Button type="button" variant="ghost" onClick={() => { setVerificationPending(false); setError(null); setCode('') }}>Use a different email</Button>
                </form>
              ) : !result ? (
                <form onSubmit={onSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="signup-email" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Email
                    </label>
                    <div className="relative mt-1.5">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-9"
                        autoFocus
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="signup-company" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Company <span className="text-muted-foreground/60">(optional)</span>
                    </label>
                    <Input
                      id="signup-company"
                      type="text"
                      placeholder="Acme AI"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Sending verification code…
                      </>
                    ) : (
                      <>
                        <KeyRound className="mr-2 size-4" />
                        Send email code
                      </>
                    )}
                  </Button>

                  <p className="text-center text-[11px] text-muted-foreground">
                    By signing up you agree to the Noetfield ToS. No spam.
                  </p>
                </form>
              ) : (
                <div className="space-y-5">
                  {/* The API key — shown once */}
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      API Key (shown once)
                    </label>
                    <div className="mt-1.5 flex items-center gap-2">
                      <code className="noetfield-mono flex-1 truncate rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
                        {result.api_key}
                      </code>
                      <Button size="icon" variant="outline" onClick={onCopyKey} aria-label="Copy API key">
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Project info */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-muted-foreground">Project ID</div>
                      <code className="noetfield-mono mt-0.5 block truncate text-foreground">{result.project_id}</code>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Free tier</div>
                      <div className="mt-0.5 font-medium text-foreground">{result.free_tier_limit} / month</div>
                    </div>
                  </div>

                  {/* Ready-to-paste curl */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Try it now
                      </label>
                      <button
                        onClick={onCopyCurl}
                        className="inline-flex items-center gap-1 text-xs text-emerald-500 hover:text-emerald-400"
                      >
                        <Copy className="size-3" />
                        Copy
                      </button>
                    </div>
                    <pre className="noetfield-mono max-h-32 overflow-y-auto rounded-md border border-border bg-card p-3 text-[11px] leading-relaxed text-foreground noetfield-scroll">
                      {result.curl_example}
                    </pre>
                  </div>

                  {/* CTA: open dashboard */}
                  <Button
                    onClick={onEnterDashboard}
                    className="w-full bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
                  >
                    Open Dashboard
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Copy button with a check state — used inline next to the API key.
 */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false)
  const onCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast({ title: 'Copied', description: label || 'Copied to clipboard.' })
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={onCopy} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
      {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
