import { NextResponse } from 'next/server'
import { manager } from '@/lib/manager'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const logs = manager.getLogs(params.id)
    return NextResponse.json({ logs })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 404 })
  }
}
