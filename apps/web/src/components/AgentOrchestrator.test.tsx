import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentOrchestrator } from './AgentOrchestrator'
import { useAgents } from '@/hooks/use-agents'

vi.mock('@/hooks/use-agents', () => ({ useAgents: vi.fn() }))

// TerminalPane mock — captures the latest onData prop so tests can invoke it
let capturedOnData: ((data: string) => void) | null = null
vi.mock('@/components/TerminalPane', () => ({
  TerminalPane: vi.fn((props: any) => {
    capturedOnData = props.onData
    return <div data-testid="terminal-pane" />
  }),
}))

// ── helpers ───────────────────────────────────────────────────────────────────

const mkAgent = (overrides: Record<string, unknown> = {}) => ({
  id: '12345678-1',
  task: 'Task 1',
  status: 'pending',
  branch: 'qb/task-1',
  model: 'sonnet',
  runner: 'claude',
  interactive: true,
  ...overrides,
})

const mockCreateAgent = vi.fn()
const mockStartAgent  = vi.fn()
const mockCancelAgent = vi.fn()
const mockSendRaw     = vi.fn()
const mockRefresh     = vi.fn()

function setupHook(overrides: Record<string, unknown> = {}) {
  ;(useAgents as any).mockReturnValue({
    agents: [mkAgent(), mkAgent({ id: '12345678-2', task: 'Task 2', status: 'running', runner: 'gemini', model: 'gemini-2.0-flash', branch: 'qb/task-2' })],
    logs: {},
    loading: false,
    createAgent: mockCreateAgent,
    startAgent: mockStartAgent,
    cancelAgent: mockCancelAgent,
    sendRaw: mockSendRaw,
    refresh: mockRefresh,
    ...overrides,
  })
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('AgentOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedOnData = null
    setupHook()
  })

  // ── rendering ──────────────────────────────────────────────────────────────

  it('renders agent task names', () => {
    render(<AgentOrchestrator />)
    expect(screen.getByText('Task 1')).toBeInTheDocument()
    expect(screen.getByText('Task 2')).toBeInTheDocument()
  })

  it('renders runner badges', () => {
    render(<AgentOrchestrator />)
    expect(screen.getByText('claude')).toBeInTheDocument()
    expect(screen.getByText('gemini')).toBeInTheDocument()
  })

  it('renders branch and model metadata', () => {
    render(<AgentOrchestrator />)
    expect(screen.getByText('qb/task-1')).toBeInTheDocument()
    expect(screen.getByText('sonnet')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    ;(useAgents as any).mockReturnValue({ agents: [], loading: true })
    render(<AgentOrchestrator />)
    expect(screen.getByText('Loading agents...')).toBeInTheDocument()
  })

  it('shows empty state when no agents exist', () => {
    setupHook({ agents: [], loading: false })
    render(<AgentOrchestrator />)
    expect(screen.getByText(/No agents spawned yet/)).toBeInTheDocument()
  })

  it('renders TerminalPane for each agent when terminal is shown', () => {
    // Running agents auto-show the terminal
    setupHook({ agents: [mkAgent({ status: 'running' })] })
    render(<AgentOrchestrator />)
    expect(screen.getByTestId('terminal-pane')).toBeInTheDocument()
  })

  it('shows interactive badge for interactive agents', () => {
    render(<AgentOrchestrator />)
    expect(screen.getAllByText('interactive').length).toBeGreaterThan(0)
  })

  // ── spawn bar ──────────────────────────────────────────────────────────────

  it('spawns a new agent on form submit', async () => {
    render(<AgentOrchestrator />)
    fireEvent.change(screen.getByPlaceholderText('Explain what the agent should do...'), {
      target: { value: 'New Task' },
    })
    fireEvent.click(screen.getByText('Spawn Agent'))
    await waitFor(() =>
      expect(mockCreateAgent).toHaveBeenCalledWith(expect.objectContaining({ task: 'New Task' }))
    )
  })

  it('spawns with custom repo path', async () => {
    render(<AgentOrchestrator />)
    fireEvent.change(screen.getByLabelText('Repo Path'), { target: { value: '/custom/repo' } })
    fireEvent.change(screen.getByPlaceholderText('Explain what the agent should do...'), {
      target: { value: 'Do something' },
    })
    fireEvent.click(screen.getByText('Spawn Agent'))
    await waitFor(() =>
      expect(mockCreateAgent).toHaveBeenCalledWith(expect.objectContaining({ repoPath: '/custom/repo' }))
    )
  })

  it('toggles interactive checkbox', async () => {
    render(<AgentOrchestrator />)
    const checkbox = screen.getByRole('checkbox')
    // Default is checked (interactive: true)
    expect(checkbox).toBeChecked()
    fireEvent.click(checkbox)
    fireEvent.change(screen.getByPlaceholderText('Explain what the agent should do...'), {
      target: { value: 'Task' },
    })
    fireEvent.click(screen.getByText('Spawn Agent'))
    await waitFor(() =>
      expect(mockCreateAgent).toHaveBeenCalledWith(expect.objectContaining({ interactive: false }))
    )
  })

  it('clears the task field after spawning', async () => {
    mockCreateAgent.mockResolvedValue({ id: 'new', task: 'New Task', status: 'pending' })
    render(<AgentOrchestrator />)
    const textarea = screen.getByPlaceholderText('Explain what the agent should do...')
    fireEvent.change(textarea, { target: { value: 'New Task' } })
    fireEvent.click(screen.getByText('Spawn Agent'))
    await waitFor(() => expect(textarea).toHaveValue(''))
  })

  // ── agent card actions ─────────────────────────────────────────────────────

  it('starts a pending agent', () => {
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getAllByText('Start')[0])
    expect(mockStartAgent).toHaveBeenCalledWith('12345678-1')
  })

  it('cancels a running agent', () => {
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(mockCancelAgent).toHaveBeenCalledWith('12345678-2')
  })

  it('reruns a completed agent', () => {
    setupHook({ agents: [mkAgent({ status: 'completed' })] })
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getByText('Rerun'))
    expect(mockStartAgent).toHaveBeenCalledWith('12345678-1')
  })

  it('reruns a failed agent', () => {
    setupHook({ agents: [mkAgent({ status: 'failed', error: 'err' })] })
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getByText('Rerun'))
    expect(mockStartAgent).toHaveBeenCalledWith('12345678-1')
  })

  it('calls refresh when Refresh button is clicked', () => {
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getByText('Refresh'))
    expect(mockRefresh).toHaveBeenCalled()
  })

  // ── terminal toggle ────────────────────────────────────────────────────────

  it('shows "Show Terminal" button for non-running agents', () => {
    render(<AgentOrchestrator />)
    expect(screen.getAllByText('Show Terminal').length).toBeGreaterThan(0)
  })

  it('toggles terminal panel via Show/Hide Terminal button', () => {
    setupHook({ agents: [mkAgent({ status: 'pending' })] })
    render(<AgentOrchestrator />)

    expect(screen.queryByTestId('terminal-pane')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Show Terminal'))
    expect(screen.getByTestId('terminal-pane')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Hide Terminal'))
    expect(screen.queryByTestId('terminal-pane')).not.toBeInTheDocument()
  })

  it('auto-opens terminal when agent status becomes running', () => {
    // Agent starts running — terminal should auto-open
    setupHook({ agents: [mkAgent({ status: 'running' })] })
    render(<AgentOrchestrator />)
    expect(screen.getByTestId('terminal-pane')).toBeInTheDocument()
    expect(screen.getByText('Hide Terminal')).toBeInTheDocument()
  })

  it('forwards TerminalPane onData to sendRaw', () => {
    setupHook({ agents: [mkAgent({ status: 'running' })] })
    render(<AgentOrchestrator />)
    act(() => capturedOnData?.('\x03'))
    expect(mockSendRaw).toHaveBeenCalledWith('12345678-1', '\x03')
  })

  // ── summary / error display ────────────────────────────────────────────────

  it('displays agent summary when completed', () => {
    setupHook({ agents: [mkAgent({ status: 'completed', summary: 'all good' })] })
    render(<AgentOrchestrator />)
    expect(screen.getByText('all good')).toBeInTheDocument()
  })

  it('displays agent error when failed', () => {
    setupHook({ agents: [mkAgent({ status: 'failed', error: 'something broke' })] })
    render(<AgentOrchestrator />)
    expect(screen.getByText('something broke')).toBeInTheDocument()
  })
})
