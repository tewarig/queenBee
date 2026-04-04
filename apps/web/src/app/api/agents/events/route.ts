import { manager } from '@/lib/manager'
import { AgentEvent } from '@queenbee/core'

export const dynamic = 'force-dynamic'

export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const onEvent = (event: AgentEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      manager.on('event', onEvent)

      // Initial heartbeats or state if needed
      controller.enqueue(encoder.encode(`: ok\n\n`))

      ;(this as any)._onEvent = onEvent
    },
    cancel() {
      if ((this as any)._onEvent) {
        manager.off('event', (this as any)._onEvent)
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
}
