import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RelativeTime } from '../src/components/dashboard/relative-time'

function render(iso: string | null, absolute = false): string {
  return renderToStaticMarkup(createElement(RelativeTime, { iso, absolute }))
}

test('SINA-QA #2: future timestamps never say negative ago', () => {
  const future = new Date(Date.now() + 2 * 60_000).toISOString()
  const output = render(future)
  expect(output).not.toMatch(/-\d+[smhd]\s+ago/)
  expect(output).toMatch(/\bin\s+\d+[smhd]\b/)
})
test('past timestamps remain marked ago', () => {
  expect(render(new Date(Date.now() - 2 * 60_000).toISOString())).toContain('ago')
})
test('null and invalid timestamp fallback remain stable', () => {
  expect(render(null)).toContain('—')
  expect(render('not-a-real-date')).toContain('not-a-real-date')
})
test('absolute ISO mode remains unchanged', () => {
  const iso = '2026-11-09T11:00:00.000Z'
  expect(render(iso, true)).toContain(iso)
})
