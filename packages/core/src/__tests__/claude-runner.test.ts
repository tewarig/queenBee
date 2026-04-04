import { describe, it, expect, vi, beforeEach } from 'vitest'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { ClaudeRunner } from '../claude-runner.js'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

const mockSpawn = vi.mocked(spawn)

// ── helpers ───────────────────────────────────────────────────────────────────

interface MockProcess extends EventEmitter {
  stdout: Readable
  stderr: Readable
  kill: ReturnType<typeof vi.fn>
}

function createMockProcess(): MockProcess {
  const proc = new EventEmitter() as MockProcess
  proc.stdout = new Readable({ read() {} })
  proc.stderr = new Readable({ read() {} })
  proc.kill = vi.fn()
  return proc
}

function pushLines(stream: Readable, lines: string[]) {
  for (const line of lines) stream.push(line + '\n')
  stream.push(null)
}

/** Flush all pending microtasks and I/O so readline processes queued data. */
const tick = () => new Promise(resolve => setImmediate(resolve))

/**
 * Run a ClaudeRunner to completion and return the done/error result.
 * - startOptions: passed to runner.start()
 * - stdoutLines: pushed to proc.stdout before close
 * - stderrLines: pushed to proc.stderr (default none)
 * - exitCode: code emitted on 'close' (default 0)
 */
async function runToCompletion(opts: {
  task?: string
  model?: string
  maxBudgetUsd?: number
  appendSystemPrompt?: string
  stdoutLines?: string[]
  stderrLines?: string[]
  exitCode?: number
  proc: MockProcess
}): Promise<{ done?: any; error?: Error; logs: string[] }> {
  const runner = new ClaudeRunner()
  const logs: string[] = []
  runner.on('log', (msg: string) => logs.push(msg))

  // Register listeners BEFORE emitting events
  const settled = new Promise<{ done?: any; error?: Error }>(resolve => {
    runner.once('done', (result) => resolve({ done: result }))
    runner.once('error', (err) => resolve({ error: err }))
  })

  runner.start({
    task: opts.task ?? 'task',
    cwd: '/proj',
    model: opts.model,
    maxBudgetUsd: opts.maxBudgetUsd,
    appendSystemPrompt: opts.appendSystemPrompt,
  })

  // Push stdout / stderr data
  if (opts.stdoutLines?.length) {
    pushLines(opts.proc.stdout, opts.stdoutLines)
  } else {
    opts.proc.stdout.push(null)
  }

  if (opts.stderrLines?.length) {
    pushLines(opts.proc.stderr, opts.stderrLines)
  } else {
    opts.proc.stderr.push(null)
  }

  // Let readline process all buffered lines
  await tick()

  opts.proc.emit('close', opts.exitCode ?? 0)

  const result = await settled
  return { ...result, logs }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ClaudeRunner', () => {
  let proc: MockProcess

  beforeEach(() => {
    vi.clearAllMocks()
    proc = createMockProcess()
    mockSpawn.mockReturnValue(proc as any)
  })

  // ── spawn args ────────────────────────────────────────────────────────────

  describe('start() — spawn arguments', () => {
    it('spawns claude with --print and stream-json by default', () => {
      new ClaudeRunner().start({ task: 'do something', cwd: '/proj' })

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--print', '--output-format', 'stream-json', '--model', 'sonnet']),
        expect.objectContaining({ cwd: '/proj' })
      )
    })

    it('appends --max-budget-usd when provided', () => {
      new ClaudeRunner().start({ task: 'task', cwd: '/proj', maxBudgetUsd: 2 })
      const args: string[] = mockSpawn.mock.calls[0][1]

      expect(args).toContain('--max-budget-usd')
      expect(args).toContain('2')
    })

    it('does not add --max-budget-usd when not provided', () => {
      new ClaudeRunner().start({ task: 'task', cwd: '/proj' })
      const args: string[] = mockSpawn.mock.calls[0][1]

      expect(args).not.toContain('--max-budget-usd')
    })

    it('appends --append-system-prompt when provided', () => {
      new ClaudeRunner().start({ task: 'task', cwd: '/proj', appendSystemPrompt: 'Be concise.' })
      const args: string[] = mockSpawn.mock.calls[0][1]

      expect(args).toContain('--append-system-prompt')
      expect(args).toContain('Be concise.')
    })

    it('does not add --append-system-prompt when not provided', () => {
      new ClaudeRunner().start({ task: 'task', cwd: '/proj' })
      const args: string[] = mockSpawn.mock.calls[0][1]

      expect(args).not.toContain('--append-system-prompt')
    })

    it('uses the given model', () => {
      new ClaudeRunner().start({ task: 'task', cwd: '/proj', model: 'opus' })
      const args: string[] = mockSpawn.mock.calls[0][1]

      expect(args).toContain('opus')
    })

    it('puts the task as the final argument', () => {
      new ClaudeRunner().start({ task: 'build login', cwd: '/proj' })
      const args: string[] = mockSpawn.mock.calls[0][1]

      expect(args[args.length - 1]).toBe('build login')
    })
  })

  // ── stream-json parsing ────────────────────────────────────────────────────

  describe('start() — stream-json parsing', () => {
    it('emits done with summary and cost on exit code 0', async () => {
      const { done } = await runToCompletion({
        proc,
        stdoutLines: [JSON.stringify({ type: 'result', result: 'All done!', total_cost_usd: 0.05 })],
      })

      expect(done.summary).toBe('All done!')
      expect(done.costUsd).toBe(0.05)
      expect(done.exitCode).toBe(0)
    })

    it('emits log for assistant text content blocks', async () => {
      const { logs } = await runToCompletion({
        proc,
        stdoutLines: [
          JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Working...' }] } }),
          JSON.stringify({ type: 'result', result: 'done' }),
        ],
      })

      expect(logs).toContain('Working...')
    })

    it('skips non-text content blocks (tool_use etc.)', async () => {
      const { logs } = await runToCompletion({
        proc,
        stdoutLines: [
          JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu_1' }] } }),
          JSON.stringify({ type: 'result', result: 'done' }),
        ],
      })

      expect(logs).toEqual([])
    })

    it('skips assistant events with no content array', async () => {
      const { logs } = await runToCompletion({
        proc,
        stdoutLines: [
          JSON.stringify({ type: 'assistant', message: {} }),
          JSON.stringify({ type: 'result', result: 'done' }),
        ],
      })

      expect(logs).toEqual([])
    })

    it('ignores unknown event types without crashing', async () => {
      const { done } = await runToCompletion({
        proc,
        stdoutLines: [
          JSON.stringify({ type: 'system', content: 'something' }),
          JSON.stringify({ type: 'result', result: 'done' }),
        ],
      })

      expect(done).toBeDefined()
    })

    it('forwards non-JSON stdout lines as plain log messages', async () => {
      const { logs } = await runToCompletion({
        proc,
        stdoutLines: ['plain text line', JSON.stringify({ type: 'result', result: '' })],
      })

      expect(logs).toContain('plain text line')
    })

    it('skips empty / whitespace-only stdout lines', async () => {
      const { logs } = await runToCompletion({
        proc,
        stdoutLines: ['   ', JSON.stringify({ type: 'result', result: '' })],
      })

      expect(logs).toEqual([])
    })

    it('forwards non-empty stderr lines as log events', async () => {
      const { logs } = await runToCompletion({
        proc,
        stderrLines: ['warning: something'],
      })

      expect(logs).toContain('warning: something')
    })

    it('does not emit empty stderr lines', async () => {
      const { logs } = await runToCompletion({
        proc,
        stderrLines: ['   '],
      })

      expect(logs).toEqual([])
    })
  })

  // ── exit handling ──────────────────────────────────────────────────────────

  describe('start() — exit handling', () => {
    it('emits error when claude exits with non-zero code', async () => {
      const { error } = await runToCompletion({ proc, exitCode: 1 })

      expect(error?.message).toContain('1')
    })

    it('treats null exit code as 0 (emits done, not error)', async () => {
      const { done, error } = await runToCompletion({ proc, exitCode: undefined })
      // undefined → emitted as null by Node, treated as 0
      // We override: proc.emit('close', null) manually
      const runner2 = new ClaudeRunner()
      const settled = new Promise<any>(resolve => {
        runner2.once('done', r => resolve({ done: r }))
        runner2.once('error', e => resolve({ error: e }))
      })
      const proc2 = createMockProcess()
      mockSpawn.mockReturnValue(proc2 as any)
      runner2.start({ task: 'task', cwd: '/proj' })
      proc2.stdout.push(null)
      proc2.stderr.push(null)
      await tick()
      proc2.emit('close', null)
      const result = await settled
      expect(result.done).toBeDefined()
      expect(result.done.exitCode).toBe(0)
    })

    it('emits error when the spawned process itself errors', async () => {
      const runner = new ClaudeRunner()
      const errorP = new Promise<Error>(resolve => runner.once('error', resolve))

      runner.start({ task: 'task', cwd: '/proj' })
      proc.emit('error', new Error('ENOENT'))

      const err = await errorP
      expect(err.message).toBe('ENOENT')
    })
  })

  // ── abort ──────────────────────────────────────────────────────────────────

  describe('abort()', () => {
    it('kills the process with SIGTERM', () => {
      const runner = new ClaudeRunner()
      runner.start({ task: 'task', cwd: '/proj' })
      runner.abort()

      expect(proc.kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('is a no-op when no process is running', () => {
      expect(() => new ClaudeRunner().abort()).not.toThrow()
    })

    it('only kills once — second abort is a no-op', () => {
      const runner = new ClaudeRunner()
      runner.start({ task: 'task', cwd: '/proj' })
      runner.abort()
      runner.abort()

      expect(proc.kill).toHaveBeenCalledTimes(1)
    })
  })
})
