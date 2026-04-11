import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAgents, looksLikeInputPrompt } from './use-agents'

// ── helpers ───────────────────────────────────────────────────────────────────

const mkAgent = (overrides: Record<string, unknown> = {}) => ({
  id: '1234', task: 'test', status: 'pending', runner: 'claude', ...overrides,
})

function setupFetch(...responses: unknown[]) {
  let call = 0
  global.fetch = vi.fn().mockImplementation(() => {
    const body = responses[Math.min(call++, responses.length - 1)]
    return Promise.resolve({ json: () => Promise.resolve(body) })
  })
}

function setupEventSource() {
  let onmessage: ((e: { data: string }) => void) | null = null
  const mockES = {
    close: vi.fn(),
    set onmessage(fn: (e: { data: string }) => void) { onmessage = fn },
    get onmessage() { return onmessage },
  }
  global.EventSource = vi.fn().mockReturnValue(mockES) as any
  return { fire: (data: unknown) => onmessage?.({ data: JSON.stringify(data) }), close: mockES.close }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('useAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve([mkAgent()]) } as any)
    global.EventSource = vi.fn().mockImplementation(() => ({ close: vi.fn(), onmessage: null })) as any
  })

  // ── initial fetch ──────────────────────────────────────────────────────────

  it('fetches agents on mount', async () => {
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    expect(result.current.agents[0].id).toBe('1234')
  })

  it('sets loading to false after fetch', async () => {
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('fetches buffered logs for running agents on mount', async () => {
    setupFetch([mkAgent({ status: 'running' })], { logs: ['a', 'b'] })
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.logs['1234']).toEqual(['a', 'b']))
    expect(global.fetch).toHaveBeenCalledWith('/api/agents/1234/logs')
  })

  it('fetches buffered logs for completed agents on mount', async () => {
    setupFetch([mkAgent({ status: 'completed' })], { logs: ['done line'] })
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.logs['1234']).toEqual(['done line']))
  })

  it('fetches buffered logs for failed agents on mount', async () => {
    setupFetch([mkAgent({ status: 'failed' })], { logs: ['err line'] })
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.logs['1234']).toEqual(['err line']))
  })

  it('does not fetch logs for pending agents', async () => {
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    const logCalls = (global.fetch as any).mock.calls.filter((c: string[]) => c[0]?.includes('/logs'))
    expect(logCalls).toHaveLength(0)
  })

  it('handles log fetch error gracefully with empty fallback', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve([mkAgent({ status: 'running' })]) })
      .mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    expect(result.current.logs['1234'] ?? []).toEqual([])
  })

  it('does not set logs when buffer is empty', async () => {
    setupFetch([mkAgent({ status: 'running' })], { logs: [] })
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    expect(result.current.logs['1234'] ?? []).toEqual([])
  })

  // ── SSE events ─────────────────────────────────────────────────────────────

  it('updates agent to running on "started" event', async () => {
    const { fire } = setupEventSource()
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    act(() => fire({ agentId: '1234', type: 'started', data: {} }))
    await waitFor(() => expect(result.current.agents[0].status).toBe('running'))
  })

  it('appends log chunks on "log" event', async () => {
    const { fire } = setupEventSource()
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    act(() => fire({ agentId: '1234', type: 'log', data: { message: 'line 1' } }))
    act(() => fire({ agentId: '1234', type: 'log', data: { message: 'line 2' } }))
    await waitFor(() => expect(result.current.logs['1234']).toEqual(['line 1', 'line 2']))
  })

  it('uses empty string when log message is absent', async () => {
    const { fire } = setupEventSource()
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    act(() => fire({ agentId: '1234', type: 'log', data: {} }))
    await waitFor(() => expect(result.current.logs['1234']).toEqual(['']))
  })

  it('sets status and summary on "completed" event', async () => {
    const { fire } = setupEventSource()
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    act(() => fire({ agentId: '1234', type: 'completed', data: { summary: 'all done' } }))
    await waitFor(() => {
      expect(result.current.agents[0].status).toBe('completed')
      expect(result.current.agents[0].summary).toBe('all done')
    })
  })

  it('sets status and error on "failed" event', async () => {
    const { fire } = setupEventSource()
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    act(() => fire({ agentId: '1234', type: 'failed', data: { error: 'boom' } }))
    await waitFor(() => {
      expect(result.current.agents[0].status).toBe('failed')
      expect(result.current.agents[0].error).toBe('boom')
    })
  })

  it('re-fetches agent list when event arrives for unknown agentId', async () => {
    const { fire } = setupEventSource()
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    const before = (global.fetch as any).mock.calls.length
    act(() => fire({ agentId: 'unknown-999', type: 'started', data: {} }))
    await waitFor(() => expect((global.fetch as any).mock.calls.length).toBeGreaterThan(before))
  })

  it('ignores SSE heartbeat lines (": ok")', async () => {
    let onmessage: ((e: { data: string }) => void) | null = null
    global.EventSource = vi.fn().mockImplementation(() => ({
      close: vi.fn(),
      set onmessage(fn: any) { onmessage = fn },
    })) as any
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    act(() => onmessage?.({ data: ': ok' }))
    expect(result.current.agents[0].status).toBe('pending')
  })

  it('logs error on invalid JSON and continues', async () => {
    let onmessage: ((e: { data: string }) => void) | null = null
    global.EventSource = vi.fn().mockImplementation(() => ({
      close: vi.fn(),
      set onmessage(fn: any) { onmessage = fn },
    })) as any
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    act(() => onmessage?.({ data: 'not-json' }))
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('closes EventSource on unmount', async () => {
    const close = vi.fn()
    global.EventSource = vi.fn().mockImplementation(() => ({ close, onmessage: null })) as any
    const { unmount } = renderHook(() => useAgents())
    await waitFor(() => {})
    unmount()
    expect(close).toHaveBeenCalled()
  })

  // ── actions ────────────────────────────────────────────────────────────────

  it('startAgent clears logs and POSTs to /start', async () => {
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    await act(async () => result.current.startAgent('1234'))
    expect(global.fetch).toHaveBeenCalledWith('/api/agents/1234/start', expect.objectContaining({ method: 'POST' }))
  })

  it('startAgent clears existing logs for the agent', async () => {
    setupFetch([mkAgent({ status: 'running' })], { logs: ['old'] })
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.logs['1234']).toEqual(['old']))
    await act(async () => result.current.startAgent('1234'))
    expect(result.current.logs['1234']).toEqual([])
  })

  it('cancelAgent POSTs to /cancel', async () => {
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    await act(async () => result.current.cancelAgent('1234'))
    expect(global.fetch).toHaveBeenCalledWith('/api/agents/1234/cancel', expect.objectContaining({ method: 'POST' }))
  })

  it('createAgent POSTs and appends new agent to list', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([mkAgent()]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mkAgent({ id: '5678', task: 'new' })) })
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    await act(async () => result.current.createAgent({ task: 'new' }))
    expect(result.current.agents).toHaveLength(2)
    expect(result.current.agents[1].id).toBe('5678')
  })

  it('sendInput POSTs { text } to /input', async () => {
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    await act(async () => result.current.sendInput('1234', 'yes'))
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/agents/1234/input',
      expect.objectContaining({ body: JSON.stringify({ text: 'yes' }) })
    )
  })

  it('sendRaw POSTs { raw } to /input', async () => {
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    await act(async () => result.current.sendRaw('1234', '\x03'))
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/agents/1234/input',
      expect.objectContaining({ body: JSON.stringify({ raw: '\x03' }) })
    )
  })

  it('refresh re-fetches the agent list', async () => {
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    const before = (global.fetch as any).mock.calls.length
    await act(async () => result.current.refresh())
    expect((global.fetch as any).mock.calls.length).toBeGreaterThan(before)
  })

  // ── removeAgent ────────────────────────────────────────────────────────────

  it('removeAgent DELETEs the agent and removes it from state', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([mkAgent()]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ logs: [] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) })
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    await act(async () => result.current.removeAgent('1234'))
    expect(global.fetch).toHaveBeenCalledWith('/api/agents/1234', expect.objectContaining({ method: 'DELETE' }))
    expect(result.current.agents).toHaveLength(0)
  })

  it('removeAgent also clears the log buffer for the agent', async () => {
    setupFetch([mkAgent({ status: 'running' })], { logs: ['some log'] }, { success: true })
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([mkAgent({ status: 'running' })]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ logs: ['some log'] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) })
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.logs['1234']).toEqual(['some log']))
    await act(async () => result.current.removeAgent('1234'))
    expect(result.current.logs['1234']).toBeUndefined()
  })

  it('removeAgent does not update state when server returns an error', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([mkAgent()]) })
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error: 'not found' }) })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    await act(async () => result.current.removeAgent('1234'))
    expect(result.current.agents).toHaveLength(1) // agent stays
    expect(spy).toHaveBeenCalledWith('Failed to remove agent:', 'not found')
    spy.mockRestore()
  })

  // ── onNotify callbacks ─────────────────────────────────────────────────────

  it('calls onNotify("done") when a completed event arrives', async () => {
    const { fire } = setupEventSource()
    const onNotify = vi.fn()
    const { result } = renderHook(() => useAgents(onNotify))
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    act(() => fire({ agentId: '1234', type: 'completed', data: { summary: 'done' } }))
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith('done', 'test'))
  })

  it('calls onNotify("failed") when a failed event arrives', async () => {
    const { fire } = setupEventSource()
    const onNotify = vi.fn()
    const { result } = renderHook(() => useAgents(onNotify))
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    act(() => fire({ agentId: '1234', type: 'failed', data: { error: 'boom' } }))
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith('failed', 'boom'))
  })

  it('calls onNotify("input") when a log chunk matches input prompt pattern', async () => {
    const { fire } = setupEventSource()
    const onNotify = vi.fn()
    const { result } = renderHook(() => useAgents(onNotify))
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    act(() => fire({ agentId: '1234', type: 'log', data: { message: 'Do you want to continue?' } }))
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith('input', 'Do you want to continue?'))
  })

  it('does not call onNotify("input") for normal log output', async () => {
    const { fire } = setupEventSource()
    const onNotify = vi.fn()
    const { result } = renderHook(() => useAgents(onNotify))
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    act(() => fire({ agentId: '1234', type: 'log', data: { message: 'Writing file src/index.ts' } }))
    await waitFor(() => expect(result.current.logs['1234']).toHaveLength(1))
    expect(onNotify).not.toHaveBeenCalled()
  })

  it('createAgent sends Content-Type application/json header', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([mkAgent()]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mkAgent({ id: '5678', task: 'new' })) })
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    await act(async () => result.current.createAgent({ task: 'new' }))
    const createCall = (global.fetch as any).mock.calls.find((c: any[]) => c[1]?.method === 'POST' && c[0] === '/api/agents')
    expect(createCall[1].headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('createAgent throws when server returns an error', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([mkAgent()]) })
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error: 'bad request' }) })
    const { result } = renderHook(() => useAgents())
    await waitFor(() => expect(result.current.agents).toHaveLength(1))
    await expect(act(async () => result.current.createAgent({ task: '' }))).rejects.toThrow('bad request')
  })
})

// ── looksLikeInputPrompt ───────────────────────────────────────────────────────

describe('looksLikeInputPrompt', () => {
  it.each([
    'Do you want to continue?',
    'Are you sure? ',
    'Proceed [y/n]',
    'Continue (y/n)',
    'Confirm (yes/no)',
    'Press Enter to continue',
    '\x1B[32mOverwrite file? [Y/n]\x1B[0m',
  ])('returns true for: %s', (input) => {
    expect(looksLikeInputPrompt(input)).toBe(true)
  })

  it.each([
    'Writing src/index.ts',
    'Running npm install...',
    'Done!',
    '',
    '\x1B[1m>> bypass permissions on\x1B[0m (shift+tab to cycle)',
    'Installed 42 packages',
  ])('returns false for: %s', (input) => {
    expect(looksLikeInputPrompt(input)).toBe(false)
  })

  it('strips ANSI codes before matching', () => {
    expect(looksLikeInputPrompt('\x1B[33mContinue?\x1B[0m')).toBe(true)
  })

  it('returns false for empty string', () => {
    expect(looksLikeInputPrompt('')).toBe(false)
  })

  it('returns false for whitespace-only string', () => {
    expect(looksLikeInputPrompt('   ')).toBe(false)
  })
})
