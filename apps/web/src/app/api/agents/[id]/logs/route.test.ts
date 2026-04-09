import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'

vi.mock('@/lib/manager', () => ({
  manager: {
    getLogs: vi.fn(),
  },
}))

import { manager } from '@/lib/manager'

const PARAMS = { params: { id: 'agent-abc' } }

describe('GET /api/agents/[id]/logs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns buffered logs for a known agent', async () => {
    vi.mocked(manager.getLogs).mockReturnValue(['chunk1', 'chunk2', 'chunk3'])

    const res = await GET({} as Request, PARAMS)
    const body = await res.json()

    expect(manager.getLogs).toHaveBeenCalledWith('agent-abc')
    expect(body).toEqual({ logs: ['chunk1', 'chunk2', 'chunk3'] })
    expect(res.status).toBe(200)
  })

  it('returns an empty logs array when no output has been buffered yet', async () => {
    vi.mocked(manager.getLogs).mockReturnValue([])

    const res = await GET({} as Request, PARAMS)
    const body = await res.json()

    expect(body).toEqual({ logs: [] })
    expect(res.status).toBe(200)
  })

  it('returns 404 when manager.getLogs throws (unknown agent)', async () => {
    vi.mocked(manager.getLogs).mockImplementationOnce(() => {
      throw new Error('Agent ghost not found')
    })

    const res = await GET({} as Request, { params: { id: 'ghost' } })
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe('Agent ghost not found')
  })
})
