import { describe, it, expect, vi, beforeEach } from 'vitest'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { GeminiRunner } from '../gemini-runner.js'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

class MockChildProcess extends EventEmitter {
  stdout = new PassThrough()
  stderr = new PassThrough()
  kill = vi.fn()
}

describe('GeminiRunner', () => {
  let runner: GeminiRunner
  let mockProcess: MockChildProcess

  beforeEach(() => {
    vi.clearAllMocks()
    mockProcess = new MockChildProcess()
    vi.mocked(spawn).mockReturnValue(mockProcess as any)
    runner = new GeminiRunner()
  })

  it('starts the gemini process with correct arguments', () => {
    runner.start({ task: 'test task', cwd: '/tmp' })
    expect(spawn).toHaveBeenCalledWith(
      'gemini',
      ['run', '--model', 'gemini-2.0-flash', 'test task'],
      expect.objectContaining({ cwd: '/tmp' })
    )
  })

  it('uses a custom model if provided', () => {
    runner.start({ task: 'test task', cwd: '/tmp', model: 'gemini-pro' })
    expect(spawn).toHaveBeenCalledWith(
      'gemini',
      ['run', '--model', 'gemini-pro', 'test task'],
      expect.any(Object)
    )
  })

  it('emits log events from stdout and ignores empty lines', async () => {
    const logs: string[] = []
    runner.on('log', (msg) => logs.push(msg))

    runner.start({ task: 'task', cwd: '.' })
    mockProcess.stdout.emit('data', Buffer.from('hello\n\nworld\n'))

    // Wait for readline to process
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(logs).toContain('hello')
    expect(logs).toContain('world')
    expect(logs.filter(l => l === '')).toHaveLength(0)
  })

  it('emits log events from stderr and ignores empty lines', async () => {
    const logs: string[] = []
    runner.on('log', (msg) => logs.push(msg))

    runner.start({ task: 'task', cwd: '.' })
    mockProcess.stderr.emit('data', Buffer.from('error output\n\n'))

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(logs).toContain('error output')
    expect(logs.filter(l => l === '')).toHaveLength(0)
  })

  it('handles empty line correctly for coverage', async () => {
    const logs: string[] = []
    runner.on('log', (msg) => logs.push(msg))
    runner.start({ task: 'task', cwd: '.' })
    mockProcess.stdout.emit('data', Buffer.from('\n'))
    mockProcess.stderr.emit('data', Buffer.from('\n'))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(logs).toEqual([])
  })

  it('emits done when process exits with 0', () => {
    const donePromise = new Promise((resolve) => runner.on('done', resolve))
    runner.start({ task: 'task', cwd: '.' })
    mockProcess.emit('close', 0)

    return expect(donePromise).resolves.toEqual({
      summary: 'Task completed by Gemini',
      exitCode: 0,
    })
  })

  it('emits error when process exits with non-zero code', async () => {
    const errorPromise = new Promise<Error>((resolve) => runner.on('error', resolve))
    runner.start({ task: 'task', cwd: '.' })
    mockProcess.emit('close', 1)

    const err = await errorPromise
    expect(err.message).toBe('gemini exited with code 1')
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

  it('abort is a no-op if no process is running', () => {
    expect(() => runner.abort()).not.toThrow()
  })
})
