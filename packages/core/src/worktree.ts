import { execFileSync, execFile } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
}

async function gitAsync(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd })
  return stdout
}

export interface WorktreeInfo {
  path: string
  branch: string
  head: string
}

export class WorktreeManager {
  private worktreesDir: string

  constructor(private repoPath: string) {
    this.worktreesDir = join(repoPath, '.queenbee', 'worktrees')
  }

  /**
   * Create a new worktree for an agent.
   * Branch: qb/<name>, path: .queenbee/worktrees/<name>
   */
  async create(name: string, baseBranch: string): Promise<{ path: string; branch: string }> {
    if (!existsSync(this.worktreesDir)) {
      mkdirSync(this.worktreesDir, { recursive: true })
    }

    const branch = `qb/${name}`
    const worktreePath = join(this.worktreesDir, name)

    try {
      git(['fetch', 'origin', baseBranch], this.repoPath)
    } catch {
      // No remote — skip fetch
    }

    git(['worktree', 'add', '-b', branch, worktreePath, baseBranch], this.repoPath)

    return { path: worktreePath, branch }
  }

  /**
   * Remove a worktree and its branch.
   */
  async remove(name: string): Promise<void> {
    const worktreePath = join(this.worktreesDir, name)
    const branch = `qb/${name}`

    try {
      git(['worktree', 'remove', worktreePath, '--force'], this.repoPath)
    } catch {
      // Already gone
    }

    try {
      git(['branch', '-D', branch], this.repoPath)
    } catch {
      // Already gone
    }
  }

  /**
   * List all queenbee-managed worktrees (branches prefixed with qb/).
   */
  list(): WorktreeInfo[] {
    try {
      const output = git(['worktree', 'list', '--porcelain'], this.repoPath)
      const worktrees: WorktreeInfo[] = []

      for (const block of output.trim().split('\n\n')) {
        const lines = block.trim().split('\n')
        const path = lines.find(l => l.startsWith('worktree '))?.slice(9) ?? ''
        const head = lines.find(l => l.startsWith('HEAD '))?.slice(5) ?? ''
        const branch = lines.find(l => l.startsWith('branch '))?.slice(7) ?? ''

        if (branch.includes('refs/heads/qb/')) {
          worktrees.push({ path, branch: branch.replace('refs/heads/', ''), head })
        }
      }

      return worktrees
    } catch {
      return []
    }
  }

  /**
   * Merge an agent's branch into the current branch of the main repo.
   */
  async merge(branch: string): Promise<{ success: boolean; conflicts: string[] }> {
    try {
      await gitAsync(['merge', branch, '--no-edit'], this.repoPath)
      return { success: true, conflicts: [] }
    } catch {
      try {
        const conflictOutput = await gitAsync(
          ['diff', '--name-only', '--diff-filter=U'],
          this.repoPath
        )
        const conflicts = conflictOutput.trim().split('\n').filter(Boolean)
        return { success: false, conflicts }
      } catch {
        return { success: false, conflicts: [] }
      }
    }
  }

  /**
   * Remove all queenbee worktrees and branches.
   */
  async cleanup(): Promise<void> {
    for (const wt of this.list()) {
      const name = wt.branch.replace('qb/', '')
      await this.remove(name)
    }
  }
}
