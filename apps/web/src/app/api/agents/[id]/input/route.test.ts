import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

vi.mock('@/lib/manager', () => ({
  manager: {
    sendInput: vi.fn(),
    sendRaw: vi.fn(),
  },
}))

import { manager } from '@/lib/manager'

const PARAMS = { params: { id: 'agent-123' } }

function makeRequest(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as Request
}

describe('POST /api/agents/[id]/input', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── text input ─────────────────────────────────────────────────────────────

  it('calls manager.sendInput and returns success for { text }', async () => {
    const res = await POST(makeRequest({ text: 'yes' }), PARAMS)
    const body = await res.json()

    expect(manager.sendInput).toHaveBeenCalledWith('agent-123', 'yes')
    expect(body).toEqual({ success: true })
    expect(res.status).toBe(200)
  })

  // ── raw input ──────────────────────────────────────────────────────────────

  it('calls manager.sendRaw and returns success for { raw }', async () => {
    const res = await POST(makeRequest({ raw: '\x03' }), PARAMS)
    const body = await res.json()

    expect(manager.sendRaw).toHaveBeenCalledWith('agent-123', '\x03')
    expect(body).toEqual({ success: true })
    expect(res.status).toBe(200)
  })

  it('handles empty string as a valid raw value', async () => {
    const res = await POST(makeRequest({ raw: '' }), PARAMS)
    const body = await res.json()

    expect(manager.sendRaw).toHaveBeenCalledWith('agent-123', '')
    expect(body).toEqual({ success: true })
  })

  it('prefers raw over text when both are present', async () => {
    const res = await POST(makeRequest({ raw: '\r', text: 'ignored' }), PARAMS)
    await res.json()

    expect(manager.sendRaw).toHaveBeenCalled()
    expect(manager.sendInput).not.toHaveBeenCalled()
  })

  // ── validation errors ──────────────────────────────────────────────────────

  it('returns 400 when body has neither text nor raw', async () => {
    const res = await POST(makeRequest({}), PARAMS)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBeTruthy()
  })

  it('returns 400 when text is empty string', async () => {
    const res = await POST(makeRequest({ text: '' }), PARAMS)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBeTruthy()
  })

  it('returns 400 when text is not a string', async () => {
    const res = await POST(makeRequest({ text: 42 }), PARAMS)

    expect(res.status).toBe(400)
  })

  it('returns 400 when body is null', async () => {
    const res = await POST(makeRequest(null), PARAMS)

    expect(res.status).toBe(400)
  })

  // ── manager errors ─────────────────────────────────────────────────────────

  it('returns 400 when manager.sendInput throws', async () => {
    vi.mocked(manager.sendInput).mockImplementationOnce(() => {
      throw new Error('agent not running')
    })

    const res = await POST(makeRequest({ text: 'hi' }), PARAMS)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('agent not running')
  })

  it('returns 400 when manager.sendRaw throws', async () => {
    vi.mocked(manager.sendRaw).mockImplementationOnce(() => {
      throw new Error('does not support raw input')
    })

    const res = await POST(makeRequest({ raw: '\x03' }), PARAMS)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('does not support raw input')
  })
})
