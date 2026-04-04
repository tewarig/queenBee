import { describe, it, expect, vi, beforeEach } from 'vitest'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { OpenAIRunner } from '../openai-runner.js'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

class MockChildProcess extends EventEmitter {
  stdout = new PassThrough()
  stderr = new PassThrough()
  kill = vi.fn()
}

describe('OpenAIRunner', () => {
  let runner: OpenAIRunner
  let mockProcess: MockChildProcess

  beforeEach(() => {
    vi.clearAllMocks()
    mockProcess = new MockChildProcess()
    vi.mocked(spawn).mockReturnValue(mockProcess as any)
    runner = new OpenAIRunner()
  })

  it('starts the openai process with correct arguments', () => {
    runner.start({ task: 'test task', cwd: '/tmp' })
    expect(spawn).toHaveBeenCalledWith(
      'openai',
      ['run', '--model', 'gpt-4o', 'test task'],
      expect.objectContaining({ cwd: '/tmp' })
    )
  })

  it('uses a custom model if provided', () => {
    runner.start({ task: 'test task', cwd: '/tmp', model: 'gpt-3.5-turbo' })
    expect(spawn).toHaveBeenCalledWith(
      'openai',
      ['run', '--model', 'gpt-3.5-turbo', 'test task'],
      expect.any(Object)
    )
  })

  it('emits log events from stdout', async () => {
    const logs: string[] = []
    runner.on('log', (msg) => logs.push(msg))

    runner.start({ task: 'task', cwd: '.' })
    mockProcess.stdout.emit('data', Buffer.from('hello from openai\n'))

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(logs).toContain('hello from openai')
  })

  it('emits log events from stderr', async () => {
    const logs: string[] = []
    runner.on('log', (msg) => logs.push(msg))

    runner.start({ task: 'task', cwd: '.' })
    mockProcess.stderr.emit('data', Buffer.from('error log\n'))

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(logs).toContain('error log')
  })

  it('emits done when process exits with 0', () => {
    const donePromise = new Promise((resolve) => runner.on('done', resolve))
    runner.start({ task: 'task', cwd: '.' })
    mockProcess.emit('close', 0)

    return expect(donePromise).resolves.toEqual({
      summary: 'Task completed by OpenAI',
      exitCode: 0,
    })
  })

  it('emits error when process exits with non-zero code', async () => {
    const errorPromise = new Promise<Error>((resolve) => runner.on('error', resolve))
    runner.start({ task: 'task', cwd: '.' })
    mockProcess.emit('close', 1)

    const err = await errorPromise
    expect(err.message).toBe('openai exited with code 1')
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
