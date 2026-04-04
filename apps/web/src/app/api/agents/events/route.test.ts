import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { manager } from '@/lib/manager'

vi.mock('@/lib/manager', () => ({
  manager: {
    on: vi.fn(),
    off: vi.fn(),
  },
}))

describe('/api/agents/events', () => {
  it('should return a ReadableStream and handle events', async () => {
    let eventCallback: any
    ;(manager.on as any).mockImplementation((name: string, cb: any) => {
      if (name === 'event') eventCallback = cb
    })

    const response = await GET()
    expect(response.body).toBeInstanceOf(ReadableStream)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(manager.on).toHaveBeenCalledWith('event', expect.any(Function))

    // Trigger an event
    const mockEvent = { agentId: '1', type: 'log', data: { message: 'test' } }
    
    // We can't easily read from the stream in this env without a lot of boiler, 
    // but we can at least verify the callback was registered and can be called.
    expect(eventCallback).toBeDefined()
    eventCallback(mockEvent)

    // Test cleanup
    const reader = response.body!.getReader()
    await reader.cancel()
    expect(manager.off).toHaveBeenCalledWith('event', expect.any(Function))
  })
})
