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
    agents: [
      mkAgent(),
      mkAgent({ id: '12345678-2', task: 'Task 2', status: 'running', runner: 'gemini', model: 'gemini-2.0-flash', branch: 'qb/task-2' }),
    ],
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

  // ── tab bar ────────────────────────────────────────────────────────────────

  it('renders a tab for each agent', () => {
    render(<AgentOrchestrator />)
    expect(screen.getAllByText('Task 1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Task 2').length).toBeGreaterThan(0)
  })

  it('renders the + button to open spawn modal', () => {
    render(<AgentOrchestrator />)
    expect(screen.getByLabelText('Spawn new agent')).toBeInTheDocument()
  })

  it('first agent tab is active by default', () => {
    render(<AgentOrchestrator />)
    const firstTab = screen.getByRole('tab', { name: /Task 1/i })
    expect(firstTab).toHaveAttribute('aria-selected', 'true')
  })

  it('switches active tab on click', () => {
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getByRole('tab', { name: /Task 2/i }))
    expect(screen.getByRole('tab', { name: /Task 2/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows loading state', () => {
    ;(useAgents as any).mockReturnValue({ agents: [], loading: true })
    render(<AgentOrchestrator />)
    expect(screen.getByText('Loading agents…')).toBeInTheDocument()
  })

  it('shows empty state with spawn button when no agents exist', () => {
    setupHook({ agents: [], loading: false })
    render(<AgentOrchestrator />)
    expect(screen.getByText(/No agents spawned yet/)).toBeInTheDocument()
  })

  it('calls refresh when refresh button is clicked', () => {
    render(<AgentOrchestrator />)
    // The refresh icon button has title="Refresh"
    fireEvent.click(screen.getByTitle('Refresh'))
    expect(mockRefresh).toHaveBeenCalled()
  })

  // ── active agent view ──────────────────────────────────────────────────────

  it('shows the active agent task, runner, branch and model', () => {
    render(<AgentOrchestrator />)
    // First agent is active by default — task appears in both tab and task-bar
    expect(screen.getAllByText('Task 1').length).toBeGreaterThan(0)
    expect(screen.getByText('qb/task-1')).toBeInTheDocument()
    expect(screen.getByText('sonnet')).toBeInTheDocument()
    expect(screen.getByText('claude')).toBeInTheDocument()
  })

  it('shows interactive badge for interactive agents', () => {
    render(<AgentOrchestrator />)
    expect(screen.getAllByText('interactive').length).toBeGreaterThan(0)
  })

  it('always renders TerminalPane for the active agent', () => {
    render(<AgentOrchestrator />)
    expect(screen.getByTestId('terminal-pane')).toBeInTheDocument()
  })

  it('shows Start button for pending agents', () => {
    render(<AgentOrchestrator />)
    expect(screen.getByText('▶ Start')).toBeInTheDocument()
  })

  it('shows Cancel button for running agents', () => {
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getByRole('tab', { name: /Task 2/i }))
    expect(screen.getByText('■ Cancel')).toBeInTheDocument()
  })

  it('starts a pending agent', () => {
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getByText('▶ Start'))
    expect(mockStartAgent).toHaveBeenCalledWith('12345678-1')
  })

  it('cancels a running agent', () => {
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getByRole('tab', { name: /Task 2/i }))
    fireEvent.click(screen.getByText('■ Cancel'))
    expect(mockCancelAgent).toHaveBeenCalledWith('12345678-2')
  })

  it('reruns a completed agent', () => {
    setupHook({ agents: [mkAgent({ status: 'completed' })] })
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getByText('↺ Rerun'))
    expect(mockStartAgent).toHaveBeenCalledWith('12345678-1')
  })

  it('reruns a failed agent', () => {
    setupHook({ agents: [mkAgent({ status: 'failed', error: 'err' })] })
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getByText('↺ Rerun'))
    expect(mockStartAgent).toHaveBeenCalledWith('12345678-1')
  })

  it('displays agent summary when completed', () => {
    setupHook({ agents: [mkAgent({ status: 'completed', summary: 'all good' })] })
    render(<AgentOrchestrator />)
    expect(screen.getByText(/all good/)).toBeInTheDocument()
  })

  it('displays agent error when failed', () => {
    setupHook({ agents: [mkAgent({ status: 'failed', error: 'something broke' })] })
    render(<AgentOrchestrator />)
    expect(screen.getByText(/something broke/)).toBeInTheDocument()
  })

  it('forwards TerminalPane onData to sendRaw', () => {
    render(<AgentOrchestrator />)
    act(() => capturedOnData?.('\x03'))
    expect(mockSendRaw).toHaveBeenCalledWith('12345678-1', '\x03')
  })

  // ── spawn modal ────────────────────────────────────────────────────────────

  it('opens spawn modal when + is clicked', () => {
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getByLabelText('Spawn new agent'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Spawn New Agent')).toBeInTheDocument()
  })

  it('closes modal when Cancel is clicked', () => {
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getByLabelText('Spawn new agent'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes modal when ✕ is clicked', () => {
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getByLabelText('Spawn new agent'))
    fireEvent.click(screen.getByLabelText('Close'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes modal on Escape key', () => {
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getByLabelText('Spawn new agent'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('spawns a new agent on modal form submit', async () => {
    mockCreateAgent.mockResolvedValue({ id: 'new-99', task: 'New Task', status: 'pending' })
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getByLabelText('Spawn new agent'))
    fireEvent.change(screen.getByPlaceholderText('Explain what the agent should do…'), {
      target: { value: 'New Task' },
    })
    fireEvent.click(screen.getByText('🐝 Spawn Agent'))
    await waitFor(() =>
      expect(mockCreateAgent).toHaveBeenCalledWith(expect.objectContaining({ task: 'New Task' }))
    )
  })

  it('spawns with custom repo path', async () => {
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getByLabelText('Spawn new agent'))
    fireEvent.change(screen.getByLabelText('Repo path'), { target: { value: '/custom/repo' } })
    fireEvent.change(screen.getByPlaceholderText('Explain what the agent should do…'), {
      target: { value: 'Do something' },
    })
    fireEvent.click(screen.getByText('🐝 Spawn Agent'))
    await waitFor(() =>
      expect(mockCreateAgent).toHaveBeenCalledWith(expect.objectContaining({ repoPath: '/custom/repo' }))
    )
  })

  it('toggles interactive checkbox in modal', async () => {
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getByLabelText('Spawn new agent'))
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeChecked()
    fireEvent.click(checkbox)
    fireEvent.change(screen.getByPlaceholderText('Explain what the agent should do…'), {
      target: { value: 'Task' },
    })
    fireEvent.click(screen.getByText('🐝 Spawn Agent'))
    await waitFor(() =>
      expect(mockCreateAgent).toHaveBeenCalledWith(expect.objectContaining({ interactive: false }))
    )
  })

  it('closes modal after successful spawn', async () => {
    mockCreateAgent.mockResolvedValue({ id: 'new-99', task: 'New Task', status: 'pending' })
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getByLabelText('Spawn new agent'))
    fireEvent.change(screen.getByPlaceholderText('Explain what the agent should do…'), {
      target: { value: 'New Task' },
    })
    fireEvent.click(screen.getByText('🐝 Spawn Agent'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('opens modal via empty-state spawn button', () => {
    setupHook({ agents: [], loading: false })
    render(<AgentOrchestrator />)
    fireEvent.click(screen.getByText('+ Spawn Agent'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
