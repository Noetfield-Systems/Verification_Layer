/**
 * GET /api/receipt-pdf?verificationId=...
 *
 * Generate a real, downloadable PDF receipt for SOC 2 / FINTRAC / EU AI Act
 * audit submissions. Server-side rendering with pdf-lib + a Helvetica-style
 * standard font (no font file embedding needed).
 */

import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib'
import { db } from '@/lib/db'
import { authenticatedKey, unauthorized } from '@/lib/request-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BLACK = rgb(0.04, 0.04, 0.04)
const WHITE = rgb(1, 1, 1)
const EMERALD = rgb(0.063, 0.725, 0.506) // #10B981
const RED = rgb(0.937, 0.267, 0.267) // #EF4444
const GRAY = rgb(0.55, 0.55, 0.55)
const BORDER = rgb(0.85, 0.85, 0.85)

export async function GET(req: NextRequest) {
  let key
  try { key = await authenticatedKey(req, 'verify:read') } catch { return unauthorized() }
  const url = new URL(req.url)
  const id = url.searchParams.get('verificationId')
  if (!id) return NextResponse.json({ error: 'verificationId required' }, { status: 400 })
  const v = await db.verification.findUnique({
    where: { id },
    include: { project: true, receipt: true },
  })
  if (!v || !v.receipt || (v.project.ownerId !== key.ownerId || (!key.scopes.split(',').includes('dashboard:read') && v.projectId !== key.projectId))) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const doc = await PDFDocument.create()
  doc.setProducer('Noetfield Verification Layer')
  doc.setCreator('Noetfield Engine v1')
  doc.setTitle(`Noetfield Receipt ${v.verdictHash?.slice(0, 16)}`)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const fontMono = await doc.embedFont(StandardFonts.Courier)

  const page = doc.addPage([612, 792]) // US Letter
  const { width, height } = page.getSize()
  const MARGIN = 50
  let y = height - MARGIN

  // Header band
  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: BLACK })
  page.drawText('NOETFIELD', { x: MARGIN, y: height - 38, size: 18, font: fontBold, color: WHITE })
  page.drawText('Verification Receipt', { x: MARGIN, y: height - 58, size: 10, font, color: rgb(0.7, 0.7, 0.7) })
  page.drawText('Cryptographic proof of agent execution safety', {
    x: width - MARGIN - 280,
    y: height - 38,
    size: 9,
    font,
    color: rgb(0.7, 0.7, 0.7),
  })
  y = height - 110

  // Verdict badge
  const verdictColor = v.verdict === 'pass' ? EMERALD : RED
  page.drawRectangle({ x: MARGIN, y: y - 24, width: 90, height: 28, color: verdictColor })
  page.drawText((v.verdict || 'UNKNOWN').toUpperCase(), {
    x: MARGIN + 12,
    y: y - 7,
    size: 13,
    font: fontBold,
    color: WHITE,
  })
  page.drawText(`Verdict Hash`, { x: MARGIN + 110, y: y - 4, size: 9, font, color: GRAY })
  page.drawText(v.verdictHash || '-', { x: MARGIN + 110, y: y - 18, size: 10, font: fontMono, color: BLACK })
  y -= 56

  // Metadata block
  const meta: Array<[string, string]> = [
    ['Project', v.project?.name || '-'],
    ['Project ID', v.projectId],
    ['Verification ID', v.id],
    ['Artifact Type', v.artifactType],
    ['Artifact Hash', v.artifactHash],
    ['Source', v.source || '-'],
    ['Model Identity', v.modelIdentity || '-'],
    ['Cost (USD)', typeof v.costUsd === 'number' ? `$${v.costUsd.toFixed(6)}` : '-'],
    ['Created At', v.createdAt.toISOString()],
    ['Completed At', v.completedAt?.toISOString() || '-'],
  ]
  for (const [label, value] of meta) {
    page.drawText(label, { x: MARGIN, y, size: 9, font, color: GRAY })
    const txt = String(value).slice(0, 60)
    page.drawText(txt, { x: MARGIN + 130, y, size: 9, font: fontMono, color: BLACK })
    y -= 16
  }
  y -= 10

  // Section divider
  page.drawLine({ start: { x: MARGIN, y }, end: { x: width - MARGIN, y }, thickness: 0.5, color: BORDER })
  y -= 20

  page.drawText('GATE RESULTS', { x: MARGIN, y, size: 11, font: fontBold, color: BLACK })
  y -= 18
  const gates: Array<{ name: string; passed: boolean; detail: string; index: number; evidence?: string[] | null }> = v.gates
    ? JSON.parse(v.gates)
    : []
  for (const g of gates) {
    if (y < MARGIN + 60) {
      // page break
      const p2 = doc.addPage([612, 792])
      void p2
      y = height - MARGIN
    }
    const dotColor = g.passed ? EMERALD : RED
    page.drawCircle({ x: MARGIN + 4, y: y + 3, size: 3, color: dotColor })
    page.drawText(g.name, { x: MARGIN + 16, y, size: 9, font: fontBold, color: BLACK })
    // Truncate detail to fit
    const detail = g.detail.length > 95 ? g.detail.slice(0, 92) + '...' : g.detail
    page.drawText(detail, { x: MARGIN + 16, y: y - 12, size: 8, font, color: GRAY })
    if (g.evidence && g.evidence.length > 0) {
      const ev = g.evidence[0].slice(0, 80)
      page.drawText(`-> ${ev}`, { x: MARGIN + 24, y: y - 24, size: 7.5, font: fontMono, color: rgb(0.4, 0.4, 0.4) })
      y -= 8
    }
    y -= 32
  }

  // Deploy token block (if pass)
  if (v.verdict === 'pass' && v.deployToken) {
    y -= 8
    page.drawLine({ start: { x: MARGIN, y }, end: { x: width - MARGIN, y }, thickness: 0.5, color: BORDER })
    y -= 20
    page.drawText('DEPLOY TOKEN', { x: MARGIN, y, size: 11, font: fontBold, color: EMERALD })
    y -= 16
    page.drawText('Token:', { x: MARGIN, y, size: 9, font, color: GRAY })
    const token = v.deployToken.length > 70 ? v.deployToken.slice(0, 67) + '...' : v.deployToken
    page.drawText(token, { x: MARGIN + 50, y, size: 9, font: fontMono, color: BLACK })
    y -= 14
    page.drawText('Expires:', { x: MARGIN, y, size: 9, font, color: GRAY })
    page.drawText(v.tokenExpiry?.toISOString() || '-', { x: MARGIN + 50, y, size: 9, font: fontMono, color: BLACK })
    y -= 14
    page.drawText('Bound to artifact hash. Infrastructure must call POST /api/v1/verify-token before deploy.', {
      x: MARGIN,
      y,
      size: 8,
      font,
      color: GRAY,
    })
    y -= 24
  }

  // Receipt signature
  page.drawLine({ start: { x: MARGIN, y }, end: { x: width - MARGIN, y }, thickness: 0.5, color: BORDER })
  y -= 20
  page.drawText('TAMPER-PROOF SIGNATURE', { x: MARGIN, y, size: 11, font: fontBold, color: BLACK })
  y -= 16
  page.drawText('Algorithm: HMAC-SHA256', { x: MARGIN, y, size: 9, font, color: GRAY })
  y -= 12
  const sig = v.receipt.signature
  // Wrap signature across lines (60 chars each)
  for (let i = 0; i < sig.length; i += 60) {
    page.drawText(sig.slice(i, i + 60), { x: MARGIN, y, size: 8, font: fontMono, color: BLACK })
    y -= 11
  }
  y -= 8
  page.drawText('Verify with: GET /api/v1/receipt/' + (v.verdictHash || ''), {
    x: MARGIN,
    y,
    size: 8,
    font,
    color: GRAY,
  })

  // Footer
  const footerY = 30
  page.drawLine({ start: { x: MARGIN, y: footerY + 14 }, end: { x: width - MARGIN, y: footerY + 14 }, thickness: 0.5, color: BORDER })
  page.drawText('Noetfield Systems · Agent Execution Assurance · Generated ' + new Date().toISOString(), {
    x: MARGIN,
    y: footerY,
    size: 7.5,
    font,
    color: GRAY,
  })
  page.drawText('CONFIDENTIAL — For SOC 2 / FINTRAC / EU AI Act audit submission', {
    x: width - MARGIN - 250,
    y: footerY,
    size: 7.5,
    font,
    color: GRAY,
  })

  const bytes = await doc.save()
  const filename = `noetfield-receipt-${v.verdictHash?.slice(7, 19) || v.id}.pdf`
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
