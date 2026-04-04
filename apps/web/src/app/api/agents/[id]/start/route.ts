import { NextResponse } from 'next/server'
import { manager } from '@/lib/manager'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    manager.start(params.id)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
