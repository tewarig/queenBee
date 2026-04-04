import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { manager } from '@/lib/manager'

vi.mock('@/lib/manager', () => ({
  manager: {
    cancel: vi.fn(),
  },
}))

describe('/api/agents/[id]/cancel', () => {
  it('should cancel an agent', async () => {
    const response = await POST({} as Request, { params: { id: '1' } })
    const data = await response.json()
    expect(data.success).toBe(true)
    expect(manager.cancel).toHaveBeenCalledWith('1')
  })

  it('should handle errors', async () => {
    ;(manager.cancel as any).mockImplementation(() => { throw new Error('fail') })
    const response = await POST({} as Request, { params: { id: '1' } })
    const data = await response.json()
    expect(data.error).toBe('fail')
    expect(response.status).toBe(400)
  })
})
