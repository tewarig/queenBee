import { NextResponse } from 'next/server'
import { manager } from '@/lib/manager'

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await manager.remove(params.id)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
