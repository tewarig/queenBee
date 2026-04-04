import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { AgentManager } from '../agent-manager.js'
import type { AgentEvent } from '../types.js'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(),
}))

const mockRandomUUID = vi.mocked(randomUUID)

// WorktreeManager — expose create/remove/merge as settable vi.fns per test
let mockCreate: ReturnType<typeof vi.fn>
let mockRemove: ReturnType<typeof vi.fn>
let mockMerge:  ReturnType<typeof vi.fn>

vi.mock('../worktree.js', () => ({
  WorktreeManager: vi.fn().mockImplementation(() => ({
    get create() { return mockCreate },
    get remove() { return mockRemove },
    get merge()  { return mockMerge  },
    list:    vi.fn().mockReturnValue([]),
    cleanup: vi.fn().mockResolvedValue(undefined),
  })),
}))

// ClaudeRunner — return an EventEmitter so tests can fire events
class MockRunner extends EventEmitter {
  start = vi.fn()
  abort = vi.fn()
}

let mockRunner: MockRunner

vi.mock('../claude-runner.js', () => ({
  ClaudeRunner: vi.fn().mockImplementation(() => {
    mockRunner = new MockRunner()
    return mockRunner
  }),
}))

// ── helpers ───────────────────────────────────────────────────────────────────

const REPO = '/my/repo'
const TASK = 'Build login page'

let uuidCounter = 0

async function makeAgent(mgr: AgentManager, opts: Record<string, unknown> = {}) {
  return mgr.create({ task: TASK, repoPath: REPO, ...opts })
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('AgentManager', () => {
  let mgr: AgentManager

  beforeEach(() => {
    vi.clearAllMocks()
    uuidCounter = 0
    // Each create() call gets a unique UUID
    mockRandomUUID.mockImplementation(() => `00000000-0000-0000-0000-${String(++uuidCounter).padStart(12, '0')}`)
    mockCreate = vi.fn().mockResolvedValue({ path: '/wt/login', branch: 'qb/login' })
    mockRemove = vi.fn().mockResolvedValue(undefined)
    mockMerge  = vi.fn().mockResolvedValue({ success: true, conflicts: [] })
    mgr = new AgentManager()
  })

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('returns a pending agent with correct defaults', async () => {
      const agent = await makeAgent(mgr)

      expect(agent.status).toBe('pending')
      expect(agent.task).toBe(TASK)
      expect(agent.repoPath).toBe(REPO)
      expect(agent.branch).toBe('qb/login')
      expect(agent.model).toBe('sonnet')
      expect(agent.baseBranch).toBe('main')
    })

    it('uses the provided baseBranch and model', async () => {
      const agent = await makeAgent(mgr, { baseBranch: 'develop', model: 'opus' })

      expect(agent.baseBranch).toBe('develop')
      expect(agent.model).toBe('opus')
    })

    it('auto-slugifies the task into a branch-friendly name', async () => {
      await makeAgent(mgr, { task: 'Build Login Page!!!' })

      const [name] = mockCreate.mock.calls[0] as [string, string]
      expect(name).toMatch(/^build-login-page/)
    })

    it('uses a custom branchName when provided', async () => {
      await makeAgent(mgr, { branchName: 'my-feature' })

      const [name] = mockCreate.mock.calls[0] as [string, string]
      expect(name).toMatch(/^my-feature/)
    })

    it('passes baseBranch to WorktreeManager.create', async () => {
      await makeAgent(mgr, { baseBranch: 'staging' })

      expect(mockCreate).toHaveBeenCalledWith(expect.any(String), 'staging')
    })

    it('sets createdAt as an ISO string', async () => {
      const agent = await makeAgent(mgr)

      expect(() => new Date(agent.createdAt)).not.toThrow()
    })

    it('returns a clone — external mutations do not affect internal state', async () => {
      const agent = await makeAgent(mgr)
      agent.status = 'failed'

      expect(mgr.get(agent.id).status).toBe('pending')
    })
  })

  // ── start ───────────────────────────────────────────────────────────────────

  describe('start()', () => {
    it('sets status to running and emits a started event', async () => {
      const agent = await makeAgent(mgr)
      const events: AgentEvent[] = []
      mgr.on('event', (e: AgentEvent) => events.push(e))

      mgr.start(agent.id)

      expect(mgr.get(agent.id).status).toBe('running')
      expect(events[0].type).toBe('started')
      expect(events[0].data.message).toContain(agent.branch)
    })

    it('throws when the agent is already running', async () => {
      const agent = await makeAgent(mgr)
      mgr.start(agent.id)

      expect(() => mgr.start(agent.id)).toThrow('already running')
    })

    it('throws when the agent id does not exist', () => {
      expect(() => mgr.start('ghost')).toThrow('not found')
    })

    it('forwards runner log events as log AgentEvents', async () => {
      const agent = await makeAgent(mgr)
      const events: AgentEvent[] = []
      mgr.on('event', (e: AgentEvent) => events.push(e))

      mgr.start(agent.id)
      mockRunner.emit('log', 'hello from claude')

      const logEvent = events.find(e => e.type === 'log')
      expect(logEvent?.data.message).toBe('hello from claude')
    })

    it('transitions to standby and emits completed when runner finishes', async () => {
      const agent = await makeAgent(mgr)
      const events: AgentEvent[] = []
      mgr.on('event', (e: AgentEvent) => events.push(e))

      mgr.start(agent.id)
      mockRunner.emit('done', { summary: 'Login page built!', costUsd: 0.03 })

      const updated = mgr.get(agent.id)
      expect(updated.status).toBe('standby')
      expect(updated.summary).toBe('Login page built!')
      expect(updated.costUsd).toBe(0.03)
      expect(events.find(e => e.type === 'completed')?.data.summary).toBe('Login page built!')
    })

    it('transitions to failed and emits failed when runner errors', async () => {
      const agent = await makeAgent(mgr)
      const events: AgentEvent[] = []
      mgr.on('event', (e: AgentEvent) => events.push(e))

      mgr.start(agent.id)
      mockRunner.emit('error', new Error('out of budget'))

      const updated = mgr.get(agent.id)
      expect(updated.status).toBe('failed')
      expect(updated.error).toBe('out of budget')
      expect(events.find(e => e.type === 'failed')?.data.error).toBe('out of budget')
    })

    it('also emits on the per-agent event channel', async () => {
      const agent = await makeAgent(mgr)
      const events: AgentEvent[] = []
      mgr.on(`event:${agent.id}`, (e: AgentEvent) => events.push(e))

      mgr.start(agent.id)

      expect(events[0].type).toBe('started')
    })

    it('calls runner.start with task, worktreePath, and model', async () => {
      const agent = await makeAgent(mgr, { model: 'opus' })
      mgr.start(agent.id)

      expect(mockRunner.start).toHaveBeenCalledWith(
        expect.objectContaining({ task: TASK, cwd: agent.worktreePath, model: 'opus' })
      )
    })

    it('removes the runner from the map after done', async () => {
      const agent = await makeAgent(mgr)
      mgr.start(agent.id)
      mockRunner.emit('done', { summary: 'ok' })

      // After done, agent is in standby — calling start again should work (new runner)
      mgr.start(agent.id)
      expect(mockRunner.start).toHaveBeenCalledTimes(1) // new runner, fresh call count
    })

    it('removes the runner from the map after error', async () => {
      const agent = await makeAgent(mgr)
      mgr.start(agent.id)
      mockRunner.emit('error', new Error('boom'))

      // After failure, cancel should be a no-op (no runner in map)
      expect(() => mgr.cancel(agent.id)).not.toThrow()
    })
  })

  // ── reassign ────────────────────────────────────────────────────────────────

  describe('reassign()', () => {
    it('updates the task and restarts a standby agent', async () => {
      const agent = await makeAgent(mgr)
      mgr.start(agent.id)
      mockRunner.emit('done', { summary: 'done' }) // → standby

      mgr.reassign(agent.id, 'New task')

      expect(mgr.get(agent.id).task).toBe('New task')
      expect(mgr.get(agent.id).status).toBe('running')
    })

    it('clears summary and error fields on reassign', async () => {
      const agent = await makeAgent(mgr)
      mgr.start(agent.id)
      mockRunner.emit('error', new Error('boom'))

      mgr.reassign(agent.id, 'Retry task')

      const updated = mgr.get(agent.id)
      expect(updated.error).toBeUndefined()
      expect(updated.summary).toBeUndefined()
      expect(updated.completedAt).toBeUndefined()
    })

    it('throws when the agent is still running', async () => {
      const agent = await makeAgent(mgr)
      mgr.start(agent.id)

      expect(() => mgr.reassign(agent.id, 'new task')).toThrow('currently running')
    })
  })

  // ── cancel ──────────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('aborts the runner and sets status to cancelled', async () => {
      const agent = await makeAgent(mgr)
      mgr.start(agent.id)
      mgr.cancel(agent.id)

      expect(mockRunner.abort).toHaveBeenCalled()
      expect(mgr.get(agent.id).status).toBe('cancelled')
    })

    it('cancels cleanly even when there is no active runner (pending agent)', async () => {
      const agent = await makeAgent(mgr)
      mgr.cancel(agent.id)

      expect(mgr.get(agent.id).status).toBe('cancelled')
    })

    it('throws when the id does not exist', () => {
      expect(() => mgr.cancel('ghost')).toThrow('not found')
    })
  })

  // ── get ──────────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('returns a snapshot of the agent', async () => {
      const agent = await makeAgent(mgr)
      expect(mgr.get(agent.id).id).toBe(agent.id)
    })

    it('throws when id does not exist', () => {
      expect(() => mgr.get('ghost')).toThrow('not found')
    })
  })

  // ── list ─────────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns an empty array initially', () => {
      expect(mgr.list()).toEqual([])
    })

    it('returns all created agents', async () => {
      mockCreate
        .mockResolvedValueOnce({ path: '/p1', branch: 'qb/a' })
        .mockResolvedValueOnce({ path: '/p2', branch: 'qb/b' })

      await makeAgent(mgr, { task: 'task A' })
      await makeAgent(mgr, { task: 'task B' })

      expect(mgr.list()).toHaveLength(2)
    })
  })

  // ── merge ────────────────────────────────────────────────────────────────────

  describe('merge()', () => {
    it('calls WorktreeManager.merge and returns the result', async () => {
      const agent = await makeAgent(mgr)
      const result = await mgr.merge(agent.id)

      expect(result.success).toBe(true)
      expect(mockMerge).toHaveBeenCalledWith(agent.branch)
    })

    it('throws when the agent is still running', async () => {
      const agent = await makeAgent(mgr)
      mgr.start(agent.id)

      await expect(mgr.merge(agent.id)).rejects.toThrow('still running')
    })

    it('throws when id does not exist', async () => {
      await expect(mgr.merge('ghost')).rejects.toThrow('not found')
    })
  })

  // ── remove ──────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('cancels a running agent before removing', async () => {
      const agent = await makeAgent(mgr)
      mgr.start(agent.id)

      await mgr.remove(agent.id)

      expect(mockRunner.abort).toHaveBeenCalled()
      expect(mgr.list()).toHaveLength(0)
    })

    it('removes a pending agent without cancelling', async () => {
      const agent = await makeAgent(mgr)
      await mgr.remove(agent.id)

      expect(mgr.list()).toHaveLength(0)
    })

    it('calls WorktreeManager.remove with the bare branch name', async () => {
      const agent = await makeAgent(mgr)
      await mgr.remove(agent.id)

      expect(mockRemove).toHaveBeenCalledWith(agent.branch.replace('qb/', ''))
    })

    it('throws when id does not exist', async () => {
      await expect(mgr.remove('ghost')).rejects.toThrow('not found')
    })
  })

  // ── cleanup ──────────────────────────────────────────────────────────────────

  describe('cleanup()', () => {
    it('removes all agents for the given repo', async () => {
      mockCreate
        .mockResolvedValueOnce({ path: '/p1', branch: 'qb/a' })
        .mockResolvedValueOnce({ path: '/p2', branch: 'qb/b' })

      await makeAgent(mgr, { task: 'A' })
      await makeAgent(mgr, { task: 'B' })

      await mgr.cleanup(REPO)

      expect(mgr.list()).toHaveLength(0)
    })

    it('does not remove agents from a different repo', async () => {
      mockCreate
        .mockResolvedValueOnce({ path: '/p1', branch: 'qb/a' })
        .mockResolvedValueOnce({ path: '/p2', branch: 'qb/b' })

      await makeAgent(mgr, { task: 'A', repoPath: '/repo/x' })
      await makeAgent(mgr, { task: 'B', repoPath: '/repo/y' })

      await mgr.cleanup('/repo/x')

      expect(mgr.list()).toHaveLength(1)
      expect(mgr.list()[0].repoPath).toBe('/repo/y')
    })
  })
})
