import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TerminalPane } from './TerminalPane'

// ── mock xterm ────────────────────────────────────────────────────────────────

let capturedDataHandler: ((data: string) => void) | null = null

const mockTerminal = {
  loadAddon: vi.fn(),
  open: vi.fn(),
  onData: vi.fn((cb: (data: string) => void) => { capturedDataHandler = cb }),
  write: vi.fn(),
  reset: vi.fn(),
  dispose: vi.fn(),
}

const mockFitAddon = {
  fit: vi.fn(),
}

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(() => mockTerminal),
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(() => mockFitAddon),
}))

// ── helpers ───────────────────────────────────────────────────────────────────

/** Flush async init() — two dynamic import awaits + React effects */
async function flushInit() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

const noop = vi.fn()

// ── tests ─────────────────────────────────────────────────────────────────────

describe('TerminalPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedDataHandler = null
    mockTerminal.onData.mockImplementation((cb) => { capturedDataHandler = cb })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── rendering ──────────────────────────────────────────────────────────────

  it('renders the Terminal title bar', () => {
    render(<TerminalPane logs={[]} interactive={false} running={false} onData={noop} />)
    expect(screen.getByText('Terminal')).toBeInTheDocument()
  })

  it('shows ● LIVE badge when running', () => {
    render(<TerminalPane logs={[]} interactive={false} running={true} onData={noop} />)
    expect(screen.getByText('● LIVE')).toBeInTheDocument()
  })

  it('does not show ● LIVE badge when not running', () => {
    render(<TerminalPane logs={[]} interactive={false} running={false} onData={noop} />)
    expect(screen.queryByText('● LIVE')).not.toBeInTheDocument()
  })

  it('shows "click to type" hint when interactive and running', () => {
    render(<TerminalPane logs={[]} interactive={true} running={true} onData={noop} />)
    expect(screen.getByText(/click to type/i)).toBeInTheDocument()
  })

  it('does not show "click to type" hint when not interactive', () => {
    render(<TerminalPane logs={[]} interactive={false} running={true} onData={noop} />)
    expect(screen.queryByText(/click to type/i)).not.toBeInTheDocument()
  })

  it('does not show "click to type" hint when not running', () => {
    render(<TerminalPane logs={[]} interactive={true} running={false} onData={noop} />)
    expect(screen.queryByText(/click to type/i)).not.toBeInTheDocument()
  })

  // ── xterm initialisation ───────────────────────────────────────────────────

  it('creates a Terminal instance after mount', async () => {
    const { Terminal } = await import('@xterm/xterm')
    render(<TerminalPane logs={[]} interactive={true} running={true} onData={noop} />)
    await flushInit()
    expect(Terminal).toHaveBeenCalled()
  })

  it('opens the terminal in the container element', async () => {
    render(<TerminalPane logs={[]} interactive={false} running={false} onData={noop} />)
    await flushInit()
    expect(mockTerminal.open).toHaveBeenCalledWith(expect.any(HTMLElement))
  })

  it('loads FitAddon and calls fit()', async () => {
    const { FitAddon } = await import('@xterm/addon-fit')
    render(<TerminalPane logs={[]} interactive={false} running={false} onData={noop} />)
    await flushInit()
    expect(FitAddon).toHaveBeenCalled()
    expect(mockTerminal.loadAddon).toHaveBeenCalledWith(mockFitAddon)
  })

  it('creates terminal with disableStdin: true for non-interactive', async () => {
    const { Terminal } = await import('@xterm/xterm')
    render(<TerminalPane logs={[]} interactive={false} running={false} onData={noop} />)
    await flushInit()
    expect(Terminal).toHaveBeenCalledWith(expect.objectContaining({ disableStdin: true }))
  })

  it('creates terminal with disableStdin: false for interactive', async () => {
    const { Terminal } = await import('@xterm/xterm')
    render(<TerminalPane logs={[]} interactive={true} running={true} onData={noop} />)
    await flushInit()
    expect(Terminal).toHaveBeenCalledWith(expect.objectContaining({ disableStdin: false }))
  })

  // ── log writing ────────────────────────────────────────────────────────────

  it('flushes pre-existing logs after terminal initialises', async () => {
    render(
      <TerminalPane logs={['chunk1', 'chunk2']} interactive={false} running={false} onData={noop} />
    )
    await flushInit()
    expect(mockTerminal.write).toHaveBeenCalledWith('chunk1')
    expect(mockTerminal.write).toHaveBeenCalledWith('chunk2')
  })

  it('writes new log chunks as they arrive', async () => {
    const { rerender } = render(
      <TerminalPane logs={[]} interactive={false} running={true} onData={noop} />
    )
    await flushInit()

    rerender(<TerminalPane logs={['first']} interactive={false} running={true} onData={noop} />)
    expect(mockTerminal.write).toHaveBeenCalledWith('first')

    rerender(<TerminalPane logs={['first', 'second']} interactive={false} running={true} onData={noop} />)
    expect(mockTerminal.write).toHaveBeenCalledWith('second')
  })

  it('does not re-write already-written chunks on re-render', async () => {
    const { rerender } = render(
      <TerminalPane logs={['a']} interactive={false} running={false} onData={noop} />
    )
    await flushInit()
    const callsAfterInit = mockTerminal.write.mock.calls.length

    rerender(<TerminalPane logs={['a']} interactive={false} running={false} onData={noop} />)
    expect(mockTerminal.write.mock.calls.length).toBe(callsAfterInit)
  })

  it('resets terminal when logs array becomes empty', async () => {
    const { rerender } = render(
      <TerminalPane logs={['a', 'b']} interactive={false} running={false} onData={noop} />
    )
    await flushInit()

    rerender(<TerminalPane logs={[]} interactive={false} running={false} onData={noop} />)
    expect(mockTerminal.reset).toHaveBeenCalled()
  })

  it('does not reset when logs array was already empty', async () => {
    const { rerender } = render(
      <TerminalPane logs={[]} interactive={false} running={false} onData={noop} />
    )
    await flushInit()

    rerender(<TerminalPane logs={[]} interactive={false} running={false} onData={noop} />)
    expect(mockTerminal.reset).not.toHaveBeenCalled()
  })

  // ── keyboard input ─────────────────────────────────────────────────────────

  it('calls onData when a key is pressed in interactive+running mode', async () => {
    const onData = vi.fn()
    render(<TerminalPane logs={[]} interactive={true} running={true} onData={onData} />)
    await flushInit()

    capturedDataHandler?.('\r')
    expect(onData).toHaveBeenCalledWith('\r')
  })

  it('does not call onData when not interactive', async () => {
    const onData = vi.fn()
    render(<TerminalPane logs={[]} interactive={false} running={true} onData={onData} />)
    await flushInit()

    capturedDataHandler?.('x')
    expect(onData).not.toHaveBeenCalled()
  })

  it('does not call onData when not running', async () => {
    const onData = vi.fn()
    render(<TerminalPane logs={[]} interactive={true} running={false} onData={onData} />)
    await flushInit()

    capturedDataHandler?.('x')
    expect(onData).not.toHaveBeenCalled()
  })

  it('picks up the latest onData callback without reinitialising', async () => {
    const onData1 = vi.fn()
    const onData2 = vi.fn()

    const { rerender } = render(
      <TerminalPane logs={[]} interactive={true} running={true} onData={onData1} />
    )
    await flushInit()

    rerender(<TerminalPane logs={[]} interactive={true} running={true} onData={onData2} />)

    capturedDataHandler?.('\t')
    expect(onData2).toHaveBeenCalledWith('\t')
    expect(onData1).not.toHaveBeenCalled()
  })

  // ── unmount / cleanup ──────────────────────────────────────────────────────

  it('disposes the terminal on unmount', async () => {
    const { unmount } = render(
      <TerminalPane logs={[]} interactive={false} running={false} onData={noop} />
    )
    await flushInit()

    unmount()
    expect(mockTerminal.dispose).toHaveBeenCalled()
  })
})
