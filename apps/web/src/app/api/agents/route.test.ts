import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'
import { manager } from '@/lib/manager'

// Mock manager
vi.mock('@/lib/manager', () => ({
  manager: {
    list: vi.fn(),
    create: vi.fn(),
  },
}))

describe('/api/agents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET should return list of agents', async () => {
    ;(manager.list as any).mockReturnValue([{ id: '1' }])
    const response = await GET()
    const data = await response.json()
    expect(data).toEqual([{ id: '1' }])
  })

  it('POST should create an agent', async () => {
    const mockAgent = { id: '2', task: 'test' }
    ;(manager.create as any).mockResolvedValue(mockAgent)
    
    const request = {
      json: () => Promise.resolve({ task: 'test' })
    } as Request

    const response = await POST(request)
    const data = await response.json()
    expect(data).toEqual(mockAgent)
    expect(manager.create).toHaveBeenCalledWith({ task: 'test' })
  })
})
