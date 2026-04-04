import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentOrchestrator } from './AgentOrchestrator'
import { useAgents } from '@/hooks/use-agents'

// Mock useAgents
vi.mock('@/hooks/use-agents', () => ({
  useAgents: vi.fn(),
}))

describe('AgentOrchestrator', () => {
  const mockAgents = [
    {
      id: '12345678-1',
      task: 'Task 1',
      status: 'pending',
      branch: 'qb/task-1',
      model: 'sonnet',
      runner: 'claude',
    },
    {
      id: '12345678-2',
      task: 'Task 2',
      status: 'running',
      branch: 'qb/task-2',
      model: 'gemini-2.0-flash',
      runner: 'gemini',
    },
  ]

  const mockCreateAgent = vi.fn()
  const mockStartAgent = vi.fn()
  const mockCancelAgent = vi.fn()
  const mockRefresh = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAgents as any).mockReturnValue({
      agents: mockAgents,
      logs: {},
      loading: false,
      createAgent: mockCreateAgent,
      startAgent: mockStartAgent,
      cancelAgent: mockCancelAgent,
      refresh: mockRefresh,
    })
  })

  it('renders a list of agents', () => {
    render(<AgentOrchestrator />)
    expect(screen.getByText('Task 1')).toBeInTheDocument()
    expect(screen.getByText('Task 2')).toBeInTheDocument()
    expect(screen.getByText('claude')).toBeInTheDocument()
    expect(screen.getByText('gemini')).toBeInTheDocument()
  })

  it('handles spawning a new agent', async () => {
    render(<AgentOrchestrator />)
    
    const taskInput = screen.getByPlaceholderText('Explain what the agent should do...')
    fireEvent.change(taskInput, { target: { value: 'New Task' } })
    
    const submitButton = screen.getByText('Spawn Agent')
    fireEvent.click(submitButton)
    
    await waitFor(() => {
      expect(mockCreateAgent).toHaveBeenCalledWith(expect.objectContaining({
        task: 'New Task'
      }))
    })
  })

  it('handles starting an agent', () => {
    render(<AgentOrchestrator />)
    const startButtons = screen.getAllByText('Start')
    fireEvent.click(startButtons[0])
    expect(mockStartAgent).toHaveBeenCalledWith('12345678-1')
  })

  it('handles cancelling an agent', () => {
    render(<AgentOrchestrator />)
    const cancelButtons = screen.getAllByText('Cancel')
    fireEvent.click(cancelButtons[0])
    expect(mockCancelAgent).toHaveBeenCalledWith('12345678-2')
  })

  it('toggles log display', () => {
    render(<AgentOrchestrator />)
    const showLogButtons = screen.getAllByText('Show Logs')
    fireEvent.click(showLogButtons[0])
    expect(screen.getByText('Live Logs')).toBeInTheDocument()
    
    fireEvent.click(screen.getByText('Hide Logs'))
    expect(screen.queryByText('Live Logs')).not.toBeInTheDocument()
  })

  it('shows loading state', () => {
    ;(useAgents as any).mockReturnValue({
      agents: [],
      loading: true,
    })
    render(<AgentOrchestrator />)
    expect(screen.getByText('Loading agents...')).toBeInTheDocument()
  })

  it('shows empty state', () => {
    ;(useAgents as any).mockReturnValue({
      agents: [],
      loading: false,
      refresh: mockRefresh,
    })
    render(<AgentOrchestrator />)
    expect(screen.getByText('No agents spawned yet.')).toBeInTheDocument()
  })

  it('handles refresh', () => {
    render(<AgentOrchestrator />)
    const refreshButton = screen.getByText('Refresh')
    fireEvent.click(refreshButton)
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('handles custom repo path', async () => {
    render(<AgentOrchestrator />)
    const repoInput = screen.getByLabelText('Repo Path')
    fireEvent.change(repoInput, { target: { value: '/custom/repo' } })
    
    // Must also set task because it's required
    const taskInput = screen.getByLabelText('Task')
    fireEvent.change(taskInput, { target: { value: 'Task' } })

    const submitButton = screen.getByText('Spawn Agent')
    fireEvent.click(submitButton)
    
    await waitFor(() => {
      expect(mockCreateAgent).toHaveBeenCalledWith(expect.objectContaining({
        repoPath: '/custom/repo'
      }))
    })
  })

  it('handles rerun for completed agent', () => {
    ;(useAgents as any).mockReturnValue({
      agents: [{ ...mockAgents[0], status: 'completed' }],
      logs: {},
      loading: false,
      startAgent: mockStartAgent,
    })
    render(<AgentOrchestrator />)
    const rerunButton = screen.getByText('Rerun')
    fireEvent.click(rerunButton)
    expect(mockStartAgent).toHaveBeenCalledWith('12345678-1')
  })

  it('displays summary and error', () => {
    ;(useAgents as any).mockReturnValue({
      agents: [
        { ...mockAgents[0], status: 'completed', summary: 'all good' },
        { ...mockAgents[1], status: 'failed', error: 'boom' },
      ],
      logs: {},
      loading: false,
    })
    render(<AgentOrchestrator />)
    expect(screen.getByText('all good')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
  })
})
