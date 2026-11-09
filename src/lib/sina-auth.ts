import { NextRequest, NextResponse } from 'next/server'
export function requireSinaOperator(req: NextRequest): NextResponse | null {
  const token = process.env.NOETFIELD_SINA_CONTROL_TOKEN
  if (!token || token.length < 32 || req.headers.get('authorization') !== `Bearer ${token}`) {
    return NextResponse.json({ error: { code: 'unauthorized', message: 'Operator authorization required' } }, { status: 401 })
  }
  return null
}
