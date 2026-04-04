import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { manager } from '@/lib/manager'

vi.mock('@/lib/manager', () => ({
  manager: {
    start: vi.fn(),
  },
}))

describe('/api/agents/[id]/start', () => {
  it('should start an agent', async () => {
    const response = await POST({} as Request, { params: { id: '1' } })
    const data = await response.json()
    expect(data.success).toBe(true)
    expect(manager.start).toHaveBeenCalledWith('1')
  })

  it('should handle errors', async () => {
    ;(manager.start as any).mockImplementation(() => { throw new Error('fail') })
    const response = await POST({} as Request, { params: { id: '1' } })
    const data = await response.json()
    expect(data.error).toBe('fail')
    expect(response.status).toBe(400)
  })
})
