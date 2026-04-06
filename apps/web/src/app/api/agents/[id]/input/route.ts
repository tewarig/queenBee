import { NextResponse } from 'next/server'
import { manager } from '@/lib/manager'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()

    // raw: pass xterm key sequences directly to PTY (no '\r' appended)
    if (typeof body?.raw === 'string') {
      manager.sendRaw(params.id, body.raw)
      return NextResponse.json({ success: true })
    }

    const text = body?.text
    if (typeof text !== 'string' || !text) {
      return NextResponse.json({ error: 'Missing text or raw' }, { status: 400 })
    }
    manager.sendInput(params.id, text)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
