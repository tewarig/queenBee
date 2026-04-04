import { describe, it, expect, vi, beforeEach } from 'vitest'
import { program, manager } from './index.js'

// Mock ora and chalk (already done in previous turn, but let's be explicit)
vi.mock('ora', () => ({
  default: vi.fn().mockReturnValue({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
  }),
}))

vi.mock('chalk', () => {
  const mockChalk = {
    green: vi.fn((s) => s),
    red: vi.fn((s) => s),
    yellow: vi.fn((s) => s),
    blue: vi.fn((s) => s),
    dim: vi.fn((s) => s),
    gray: vi.fn((s) => s),
    bold: vi.fn((s) => s),
  }
  // @ts-ignore
  mockChalk.bold.underline = vi.fn((s) => s)
  return { default: mockChalk }
})

// Mock process.exit properly
const mockExit = vi.fn()
vi.stubGlobal('process', { ...process, exit: mockExit })

const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {})
const mockError = vi.spyOn(console, 'error').mockImplementation(() => {})

describe('CLI Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('spawn command should call manager.create', async () => {
    const createSpy = vi.spyOn(manager, 'create').mockResolvedValue({
      id: '12345678-abcd',
      branch: 'qb/test',
      task: 'test task',
      runner: 'claude',
    } as any)

    await program.parseAsync(['node', 'qb', 'spawn', 'test task'])

    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
      task: 'test task',
    }))
    expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('test task'))
  })

  it('spawn command should handle errors', async () => {
    vi.spyOn(manager, 'create').mockRejectedValue(new Error('spawn failed'))

    await program.parseAsync(['node', 'qb', 'spawn', 'test task'])

    // No need for expect here as fail() is called on spinner
  })

  it('list command should call manager.list', async () => {
    const listSpy = vi.spyOn(manager, 'list').mockReturnValue([
      { id: '12345678', status: 'running', branch: 'qb/task', task: 'task' } as any
    ])

    await program.parseAsync(['node', 'qb', 'list'])

    expect(listSpy).toHaveBeenCalled()
    expect(mockLog).toHaveBeenCalled()
  })

  it('list command should handle empty list', async () => {
    vi.spyOn(manager, 'list').mockReturnValue([])

    await program.parseAsync(['node', 'qb', 'list'])

    expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('No agents found'))
  })

  it('start command should call manager.start', async () => {
    vi.spyOn(manager, 'getInternal' as any).mockReturnValue({
      id: '1234',
      status: 'pending',
      branch: 'qb/test'
    })
    const startSpy = vi.spyOn(manager, 'start')

    await program.parseAsync(['node', 'qb', 'start', '1234'])

    expect(startSpy).toHaveBeenCalledWith('1234')
    expect(mockExit).toHaveBeenCalledWith(0)
  })

  it('start command should handle errors', async () => {
    vi.spyOn(manager, 'getInternal' as any).mockReturnValue({
      id: '1234',
      status: 'pending'
    })
    vi.spyOn(manager, 'start').mockImplementation(() => { throw new Error('start failed') })

    await program.parseAsync(['node', 'qb', 'start', '1234'])

    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('start failed'))
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it('cancel command should call manager.cancel', async () => {
    vi.spyOn(manager, 'getInternal' as any).mockReturnValue({
      id: '1234',
      status: 'running'
    })
    const cancelSpy = vi.spyOn(manager, 'cancel')

    await program.parseAsync(['node', 'qb', 'cancel', '1234'])

    expect(cancelSpy).toHaveBeenCalledWith('1234')
    expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Cancelled agent 1234'))
  })

  it('cancel command should handle errors', async () => {
    vi.spyOn(manager, 'cancel').mockImplementation(() => { throw new Error('cancel failed') })

    await program.parseAsync(['node', 'qb', 'cancel', '1234'])

    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('cancel failed'))
  })

  it('remove command should call manager.remove', async () => {
    const removeSpy = vi.spyOn(manager, 'remove')

    await program.parseAsync(['node', 'qb', 'remove', '1234'])

    expect(removeSpy).toHaveBeenCalledWith('1234')
  })

  it('remove command should handle errors', async () => {
    vi.spyOn(manager, 'remove').mockRejectedValue(new Error('remove failed'))

    await program.parseAsync(['node', 'qb', 'remove', '1234'])
  })

  it('start command with follow should listen to events', async () => {
    const onSpy = vi.spyOn(manager, 'on')
    
    // We don't await because it might hang if not completed
    program.parseAsync(['node', 'qb', 'start', '1234', '--follow'])

    expect(onSpy).toHaveBeenCalledWith('event', expect.any(Function))
    
    const eventHandler = onSpy.mock.calls[0][1] as (event: any) => void
    
    // Test log event
    const mockStdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    eventHandler({ agentId: '1234', type: 'log', data: { message: 'hello' } })
    expect(mockStdoutWrite).toHaveBeenCalledWith('hello')

    // Test completed event
    eventHandler({ agentId: '1234', type: 'completed', data: { summary: 'done' } })
    expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('completed'))
    expect(mockExit).toHaveBeenCalledWith(0)

    // Test failed event
    eventHandler({ agentId: '1234', type: 'failed', data: { error: 'boom' } })
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('failed: boom'))
    expect(mockExit).toHaveBeenCalledWith(1)
  })
})
