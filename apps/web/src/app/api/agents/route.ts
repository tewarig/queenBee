import { NextResponse } from 'next/server'
import { manager } from '@/lib/manager'

export async function GET() {
  const agents = manager.list()
  return NextResponse.json(agents)
}

export async function POST(request: Request) {
  const options = await request.json()
  const agent = await manager.create(options)
  return NextResponse.json(agent)
}
