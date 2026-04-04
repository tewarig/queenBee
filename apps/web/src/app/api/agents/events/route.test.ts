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
  it('should return a ReadableStream and handle cleanup', async () => {
    const response = await GET()
    expect(response.body).toBeInstanceOf(ReadableStream)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(manager.on).toHaveBeenCalledWith('event', expect.any(Function))

    // Test cleanup
    const reader = response.body!.getReader()
    await reader.cancel()
    expect(manager.off).toHaveBeenCalledWith('event', expect.any(Function))
  })
})
