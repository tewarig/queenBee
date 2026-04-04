import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execFileSync, execFile } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { WorktreeManager } from '../worktree.js'

// vi.mock is hoisted — use vi.fn() directly inside the factory,
// then access typed mocks via vi.mocked() after the import.

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  execFile: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

const mockExecFileSync = vi.mocked(execFileSync)
const mockExecFileCb   = vi.mocked(execFile)
const mockExistsSync   = vi.mocked(existsSync)
const mockMkdirSync    = vi.mocked(mkdirSync)

// ── helpers ───────────────────────────────────────────────────────────────────

function resolveExecFile(stdout = '') {
  mockExecFileCb.mockImplementation((_cmd, _args, _opts, cb: any) => {
    cb(null, { stdout, stderr: '' })
  })
}

function rejectExecFile() {
  mockExecFileCb.mockImplementation((_cmd, _args, _opts, cb: any) => {
    cb(new Error('git error'))
  })
}

const REPO = '/repo'

// ── tests ─────────────────────────────────────────────────────────────────────

describe('WorktreeManager', () => {
  let mgr: WorktreeManager

  beforeEach(() => {
    vi.clearAllMocks()
    mgr = new WorktreeManager(REPO)
  })

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates the worktrees dir when it does not exist', async () => {
      mockExistsSync.mockReturnValue(false)
      mockExecFileSync.mockReturnValue('')

      await mgr.create('login', 'main')

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.queenbee/worktrees'),
        { recursive: true }
      )
    })

    it('skips mkdirSync when worktrees dir already exists', async () => {
      mockExistsSync.mockReturnValue(true)
      mockExecFileSync.mockReturnValue('')

      await mgr.create('login', 'main')

      expect(mockMkdirSync).not.toHaveBeenCalled()
    })

    it('returns the correct path and branch', async () => {
      mockExistsSync.mockReturnValue(true)
      mockExecFileSync.mockReturnValue('')

      const result = await mgr.create('login', 'main')

      expect(result.branch).toBe('qb/login')
      expect(result.path).toContain('login')
    })

    it('silently ignores a failed git fetch (no remote)', async () => {
      mockExistsSync.mockReturnValue(true)
      mockExecFileSync
        .mockImplementationOnce(() => { throw new Error('no remote') })
        .mockReturnValue('')

      const result = await mgr.create('login', 'main')

      expect(result.branch).toBe('qb/login')
    })

    it('passes correct args to git worktree add', async () => {
      mockExistsSync.mockReturnValue(true)
      mockExecFileSync.mockReturnValue('')

      await mgr.create('dashboard', 'develop')

      const worktreeCall = mockExecFileSync.mock.calls.find(
        (c) => (c[1] as string[])?.includes('worktree')
      )
      expect(worktreeCall![1]).toEqual([
        'worktree', 'add', '-b', 'qb/dashboard',
        expect.stringContaining('dashboard'),
        'develop',
      ])
    })
  })

  // ── remove ──────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('removes the worktree and deletes the branch', async () => {
      mockExecFileSync.mockReturnValue('')

      await mgr.remove('login')

      const calls = mockExecFileSync.mock.calls
      expect(calls.some((c) => (c[1] as string[])?.includes('remove'))).toBe(true)
      expect(calls.some((c) => (c[1] as string[])?.includes('-D'))).toBe(true)
    })

    it('swallows errors from git worktree remove', async () => {
      mockExecFileSync
        .mockImplementationOnce(() => { throw new Error('not a worktree') })
        .mockReturnValue('')

      await expect(mgr.remove('login')).resolves.toBeUndefined()
    })

    it('swallows errors from git branch -D', async () => {
      mockExecFileSync
        .mockReturnValueOnce('')
        .mockImplementationOnce(() => { throw new Error('no branch') })

      await expect(mgr.remove('login')).resolves.toBeUndefined()
    })
  })

  // ── list ────────────────────────────────────────────────────────────────────

  describe('list()', () => {
    const PORCELAIN = [
      'worktree /repo',
      'HEAD aabbcc',
      'branch refs/heads/main',
      '',
      'worktree /repo/.queenbee/worktrees/login-abc',
      'HEAD ddeeff',
      'branch refs/heads/qb/login-abc',
    ].join('\n')

    it('returns only qb/* worktrees and covers both branches in list', () => {
      const PORCELAIN = [
        'worktree /repo/.queenbee/worktrees/login-abc',
        'HEAD ddeeff',
        'branch refs/heads/qb/login-abc',
        '',
        'worktree /repo',
        'HEAD aabbcc',
        'branch refs/heads/main',
      ].join('\n')
      mockExecFileSync.mockReturnValue(PORCELAIN)

      const result = mgr.list()

      expect(result).toHaveLength(1)
      expect(result[0].branch).toBe('qb/login-abc')
    })

    it('skips worktrees with missing branch line', () => {
      mockExecFileSync.mockReturnValue('worktree /repo/x\nHEAD aabb')
      expect(mgr.list()).toEqual([])
    })

    it('skips worktrees that are not qb/*', () => {
      mockExecFileSync.mockReturnValue('worktree /repo/y\nHEAD cc\nbranch refs/heads/other')
      expect(mgr.list()).toEqual([])
    })

    it('returns an empty array when git throws', () => {
      mockExecFileSync.mockImplementation(() => { throw new Error('not a repo') })

      expect(mgr.list()).toEqual([])
    })

    it('returns an empty array when no qb/ branches exist', () => {
      mockExecFileSync.mockReturnValue('worktree /repo\nHEAD aabb\nbranch refs/heads/main')

      expect(mgr.list()).toEqual([])
    })
  })

  // ── merge ───────────────────────────────────────────────────────────────────

  describe('merge()', () => {
    it('returns success when git merge succeeds', async () => {
      resolveExecFile()

      const result = await mgr.merge('qb/login')

      expect(result.success).toBe(true)
      expect(result.conflicts).toEqual([])
    })

    it('returns failure with conflict file list', async () => {
      mockExecFileCb
        .mockImplementationOnce((_c, _a, _o, cb: any) => cb(new Error('conflict')))
        .mockImplementationOnce((_c, _a, _o, cb: any) => cb(null, { stdout: 'src/foo.ts\nsrc/bar.ts\n', stderr: '' }))

      const result = await mgr.merge('qb/login')

      expect(result.success).toBe(false)
      expect(result.conflicts).toEqual(['src/foo.ts', 'src/bar.ts'])
    })

    it('returns empty conflicts when both merge and diff-filter fail', async () => {
      rejectExecFile()

      const result = await mgr.merge('qb/login')

      expect(result.success).toBe(false)
      expect(result.conflicts).toEqual([])
    })
  })

  // ── cleanup ─────────────────────────────────────────────────────────────────

  describe('cleanup()', () => {
    it('removes all qb/* worktrees', async () => {
      const PORCELAIN = [
        'worktree /repo/.queenbee/worktrees/login-abc',
        'HEAD aabb',
        'branch refs/heads/qb/login-abc',
        '',
        'worktree /repo/.queenbee/worktrees/dash-def',
        'HEAD ccdd',
        'branch refs/heads/qb/dash-def',
      ].join('\n')

      mockExecFileSync
        .mockReturnValueOnce(PORCELAIN)  // list()
        .mockReturnValue('')              // remove() calls

      await mgr.cleanup()

      const removeCalls = mockExecFileSync.mock.calls.filter(
        (c) => (c[1] as string[])?.includes('remove') || (c[1] as string[])?.includes('-D')
      )
      expect(removeCalls.length).toBe(4) // 2 worktrees × 2 git commands each
    })

    it('does nothing when there are no qb/ worktrees', async () => {
      mockExecFileSync.mockReturnValue('worktree /repo\nHEAD aabb\nbranch refs/heads/main')

      await mgr.cleanup()

      expect(mockExecFileSync).toHaveBeenCalledTimes(1)
    })
  })
})
