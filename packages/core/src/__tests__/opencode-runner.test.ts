import { describe, it, expect, vi, beforeEach } from 'vitest'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { OpenCodeRunner } from '../opencode-runner.js'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

class MockChildProcess extends EventEmitter {
  stdout = new PassThrough()
  stderr = new PassThrough()
  kill = vi.fn()
}

describe('OpenCodeRunner', () => {
  let runner: OpenCodeRunner
  let mockProcess: MockChildProcess

  beforeEach(() => {
    vi.clearAllMocks()
    mockProcess = new MockChildProcess()
    vi.mocked(spawn).mockReturnValue(mockProcess as any)
    runner = new OpenCodeRunner()
  })

  it('starts the opencode process with correct arguments', () => {
    runner.start({ task: 'test task', cwd: '/tmp' })
    expect(spawn).toHaveBeenCalledWith(
      'opencode',
      ['run', '--task', 'test task'],
      expect.objectContaining({ cwd: '/tmp' })
    )
  })

  it('emits log events from stdout', async () => {
    const logs: string[] = []
    runner.on('log', (msg) => logs.push(msg))

    runner.start({ task: 'task', cwd: '.' })
    mockProcess.stdout.emit('data', Buffer.from('hello from opencode\n'))

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(logs).toContain('hello from opencode')
  })

  it('emits log events from stderr', async () => {
    const logs: string[] = []
    runner.on('log', (msg) => logs.push(msg))

    runner.start({ task: 'task', cwd: '.' })
    mockProcess.stderr.emit('data', Buffer.from('opencode error\n'))

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(logs).toContain('opencode error')
  })

  it('emits error when process exits with non-zero code', async () => {
    const errorPromise = new Promise<Error>((resolve) => runner.on('error', resolve))
    runner.start({ task: 'task', cwd: '.' })
    mockProcess.emit('close', 1)

    const err = await errorPromise
    expect(err.message).toBe('opencode exited with code 1')
  })

  it('emits error when spawn fails', async () => {
    const errorPromise = new Promise<Error>((resolve) => runner.on('error', resolve))
    runner.start({ task: 'task', cwd: '.' })
    mockProcess.emit('error', new Error('spawn failed'))

    const err = await errorPromise
    expect(err.message).toBe('spawn failed')
  })

  it('aborts the process', () => {
    runner.start({ task: 'task', cwd: '.' })
    runner.abort()
    expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
  })
})
