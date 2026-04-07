import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as pty from 'node-pty'
import { PtyRunner } from '../pty-runner.js'

// ── mock node-pty ─────────────────────────────────────────────────────────────

let dataCallback: ((data: string) => void) | null = null
let exitCallback: ((result: { exitCode: number }) => void) | null = null

const mockPtyProcess = {
  onData: vi.fn((cb: (data: string) => void) => { dataCallback = cb }),
  onExit: vi.fn((cb: (r: { exitCode: number }) => void) => { exitCallback = cb }),
  write: vi.fn(),
  kill: vi.fn(),
}

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => mockPtyProcess),
}))

const mockSpawn = vi.mocked(pty.spawn)

// ── helpers ───────────────────────────────────────────────────────────────────

const OPTIONS = { task: 'build auth', cwd: '/repo', model: 'sonnet' }

function startRunner(opts = OPTIONS) {
  const runner = new PtyRunner()
  runner.start(opts)
  return runner
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('PtyRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dataCallback = null
    exitCallback = null
    mockPtyProcess.onData.mockImplementation((cb) => { dataCallback = cb })
    mockPtyProcess.onExit.mockImplementation((cb) => { exitCallback = cb })
  })

  // ── start ──────────────────────────────────────────────────────────────────

  describe('start()', () => {
    it('spawns claude with the task as last arg', () => {
      startRunner()
      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['build auth']),
        expect.objectContaining({ cwd: '/repo' })
      )
    })

    it('includes --dangerously-skip-permissions flag', () => {
      startRunner()
      const args = mockSpawn.mock.calls[0][1]
      expect(args).toContain('--dangerously-skip-permissions')
    })

    it('passes model to --model flag', () => {
      startRunner({ task: 'task', cwd: '/repo', model: 'opus' })
      const args = mockSpawn.mock.calls[0][1]
      expect(args).toContain('--model')
      expect(args).toContain('opus')
    })

    it('defaults model to "sonnet" when not provided', () => {
      startRunner({ task: 'task', cwd: '/repo' })
      const args = mockSpawn.mock.calls[0][1]
      expect(args).toContain('sonnet')
    })

    it('spawns with xterm-256color terminal name', () => {
      startRunner()
      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.any(Array),
        expect.objectContaining({ name: 'xterm-256color' })
      )
    })

    it('spawns with 120 cols and 30 rows', () => {
      startRunner()
      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.any(Array),
        expect.objectContaining({ cols: 120, rows: 30 })
      )
    })

    it('registers onData and onExit handlers', () => {
      startRunner()
      expect(mockPtyProcess.onData).toHaveBeenCalled()
      expect(mockPtyProcess.onExit).toHaveBeenCalled()
    })
  })

  // ── log events ─────────────────────────────────────────────────────────────

  describe('log emission', () => {
    it('emits "log" event when PTY data arrives', () => {
      const runner = startRunner()
      const logs: string[] = []
      runner.on('log', (d: string) => logs.push(d))

      dataCallback!('hello world\r\n')

      expect(logs).toEqual(['hello world\r\n'])
    })

    it('emits multiple log events for each data chunk', () => {
      const runner = startRunner()
      const logs: string[] = []
      runner.on('log', (d: string) => logs.push(d))

      dataCallback!('first')
      dataCallback!('second')

      expect(logs).toHaveLength(2)
    })
  })

  // ── done / error ───────────────────────────────────────────────────────────

  describe('exit handling', () => {
    it('emits "done" with exitCode 0 on clean exit', () => {
      const runner = startRunner()
      const done = vi.fn()
      runner.on('done', done)

      exitCallback!({ exitCode: 0 })

      expect(done).toHaveBeenCalledWith({ summary: '', exitCode: 0 })
    })

    it('emits "error" with non-zero exit code', () => {
      const runner = startRunner()
      const error = vi.fn()
      runner.on('error', error)

      exitCallback!({ exitCode: 1 })

      expect(error).toHaveBeenCalledWith(expect.any(Error))
      expect(error.mock.calls[0][0].message).toContain('1')
    })

    it('ignores duplicate exit events (exited flag guard)', () => {
      const runner = startRunner()
      const done = vi.fn()
      runner.on('done', done)

      exitCallback!({ exitCode: 0 })
      exitCallback!({ exitCode: 0 })

      expect(done).toHaveBeenCalledTimes(1)
    })
  })

  // ── sendInput ──────────────────────────────────────────────────────────────

  describe('sendInput()', () => {
    it('writes text + \\r to the PTY', () => {
      const runner = startRunner()
      runner.sendInput('yes')
      expect(mockPtyProcess.write).toHaveBeenCalledWith('yes\r')
    })

    it('is a no-op before start() is called', () => {
      const runner = new PtyRunner()
      expect(() => runner.sendInput('text')).not.toThrow()
      expect(mockPtyProcess.write).not.toHaveBeenCalled()
    })
  })

  // ── writeRaw ───────────────────────────────────────────────────────────────

  describe('writeRaw()', () => {
    it('writes data as-is without appending \\r', () => {
      const runner = startRunner()
      runner.writeRaw('\x1b[A') // up arrow
      expect(mockPtyProcess.write).toHaveBeenCalledWith('\x1b[A')
    })

    it('passes Ctrl+C sequence unchanged', () => {
      const runner = startRunner()
      runner.writeRaw('\x03')
      expect(mockPtyProcess.write).toHaveBeenCalledWith('\x03')
    })

    it('is a no-op before start() is called', () => {
      const runner = new PtyRunner()
      expect(() => runner.writeRaw('\x03')).not.toThrow()
      expect(mockPtyProcess.write).not.toHaveBeenCalled()
    })
  })

  // ── abort ──────────────────────────────────────────────────────────────────

  describe('abort()', () => {
    it('sends SIGTERM to the PTY process', () => {
      const runner = startRunner()
      runner.abort()
      expect(mockPtyProcess.kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('is a no-op before start() is called', () => {
      const runner = new PtyRunner()
      expect(() => runner.abort()).not.toThrow()
      expect(mockPtyProcess.kill).not.toHaveBeenCalled()
    })

    it('prevents exit handlers from firing after abort', () => {
      const runner = startRunner()
      const done = vi.fn()
      const error = vi.fn()
      runner.on('done', done)
      runner.on('error', error)

      runner.abort()
      exitCallback!({ exitCode: 0 })

      expect(done).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
    })

    it('clears the ptyProcess reference after abort', () => {
      const runner = startRunner()
      runner.abort()
      // Subsequent abort should be a no-op, not throw
      expect(() => runner.abort()).not.toThrow()
    })
  })
})
