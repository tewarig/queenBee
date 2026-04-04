import { manager } from '@/lib/manager'
import { AgentEvent } from '@queenbee/core'

export const dynamic = 'force-dynamic'

export async function GET() {
  const encoder = new TextEncoder()

  // Use a closure so cancel() can reliably remove the same listener
  let onEvent: ((event: AgentEvent) => void) | null = null
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data))
        } catch {
          // Controller already closed — swallow
        }
      }

      // Send initial ping so the browser knows the connection is live
      enqueue(': ping\n\n')

      onEvent = (event: AgentEvent) => {
        enqueue(`data: ${JSON.stringify(event)}\n\n`)
      }

      manager.on('event', onEvent)

      // Keepalive every 15s — prevents proxies and browsers from closing idle SSE
      keepAliveTimer = setInterval(() => {
        enqueue(': ping\n\n')
      }, 15_000)
    },

    cancel() {
      if (onEvent) {
        manager.off('event', onEvent)
        onEvent = null
      }
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer)
        keepAliveTimer = null
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
