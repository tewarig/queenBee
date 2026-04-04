import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAgents } from './use-agents'

describe('useAgents', () => {
  const mockAgent = { id: '1234', task: 'test', status: 'pending', runner: 'claude' }

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve([mockAgent]),
    } as any)
    
    global.EventSource = vi.fn().mockImplementation(() => ({
      close: vi.fn(),
      onmessage: null,
    })) as any
  })

  it('fetches agents on mount', async () => {
    const { result } = renderHook(() => useAgents())

    await waitFor(() => {
      expect(result.current.agents).toHaveLength(1)
      expect(result.current.agents[0].id).toBe('1234')
    })
  })

  it('handles starting an agent', async () => {
    const { result } = renderHook(() => useAgents())
    
    await act(async () => {
      await result.current.startAgent('1234')
    })

    expect(global.fetch).toHaveBeenCalledWith('/api/agents/1234/start', expect.objectContaining({
      method: 'POST'
    }))
  })

  it('handles cancelling an agent', async () => {
    const { result } = renderHook(() => useAgents())
    
    await act(async () => {
      await result.current.cancelAgent('1234')
    })

    expect(global.fetch).toHaveBeenCalledWith('/api/agents/1234/cancel', expect.objectContaining({
      method: 'POST'
    }))
  })

  it('handles creating an agent', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      json: () => Promise.resolve([mockAgent]),
    } as any).mockResolvedValueOnce({
      json: () => Promise.resolve({ ...mockAgent, id: '5678' }),
    } as any)

    const { result } = renderHook(() => useAgents())
    
    await waitFor(() => expect(result.current.agents).toHaveLength(1))

    await act(async () => {
      await result.current.createAgent({ task: 'new' })
    })

    expect(result.current.agents).toHaveLength(2)
  })

  it('handles EventSource messages', async () => {
    let messageHandler: any
    const mockEventSource = {
      close: vi.fn(),
      set onmessage(handler: any) { messageHandler = handler }
    }
    global.EventSource = vi.fn().mockReturnValue(mockEventSource) as any

    const { result } = renderHook(() => useAgents())

    await waitFor(() => expect(result.current.agents).toHaveLength(1))

    // Simulate started event
    act(() => {
      messageHandler({ data: JSON.stringify({
        agentId: '1234',
        type: 'started',
        data: {}
      }) })
    })

    await waitFor(() => {
      expect(result.current.agents[0].status).toBe('running')
    })

    // Simulate log event
    act(() => {
      messageHandler({ data: JSON.stringify({
        agentId: '1234',
        type: 'log',
        data: { message: 'new log' }
      }) })
    })

    await waitFor(() => {
      expect(result.current.logs['1234']).toContain('new log')
    })

    // Simulate completed event
    act(() => {
      messageHandler({ data: JSON.stringify({
        agentId: '1234',
        type: 'completed',
        data: { summary: 'finished' }
      }) })
    })

    await waitFor(() => {
      expect(result.current.agents[0].status).toBe('standby')
      expect(result.current.agents[0].summary).toBe('finished')
    })

    // Simulate failed event
    act(() => {
      messageHandler({ data: JSON.stringify({
        agentId: '1234',
        type: 'failed',
        data: { error: 'boom' }
      }) })
    })

    await waitFor(() => {
      expect(result.current.agents[0].status).toBe('failed')
      expect(result.current.agents[0].error).toBe('boom')
    })

    // Test refresh
    await act(async () => {
      result.current.refresh()
    })
    expect(global.fetch).toHaveBeenCalledWith('/api/agents')

    // Test new agent re-fetch
    act(() => {
      messageHandler({ data: JSON.stringify({
        agentId: '9999',
        type: 'started',
        data: {}
      }) })
    })
    await act(async () => {
      messageHandler({ data: ': ok' })
    })
    expect(result.current.agents).toHaveLength(1)

    // Test invalid JSON
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    act(() => {
      messageHandler({ data: 'invalid json' })
    })
    expect(consoleSpy).toHaveBeenCalled()
  })
})
