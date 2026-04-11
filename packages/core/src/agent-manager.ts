import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { WorktreeManager } from './worktree.js'
import { ClaudeRunner } from './claude-runner.js'
import { PtyRunner } from './pty-runner.js'
import { GeminiRunner } from './gemini-runner.js'
import { OpenAIRunner } from './openai-runner.js'
import { OpenCodeRunner } from './opencode-runner.js'
import type { Agent, AgentEvent, CreateAgentOptions } from './types.js'

function slugify(task: string): string {
  return task
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

interface Runner {
  on(event: string | symbol, listener: (...args: any[]) => void): this
  start(options: any): void
  abort(): void
  sendInput?(text: string): void
  writeRaw?(data: string): void
}

const MAX_LOG_BUFFER = 2000 // raw PTY chunks per agent

export class AgentManager extends EventEmitter {
  private agents = new Map<string, Agent>()
  private runners = new Map<string, Runner>()
  private worktreeManagers = new Map<string, WorktreeManager>()
  private logBuffers = new Map<string, string[]>()

  /**
   * Create a new agent (does not start it yet).
   */
  async create(options: CreateAgentOptions): Promise<Agent> {
    const id = randomUUID()
    const baseBranch = options.baseBranch ?? 'main'
    const name = options.branchName ?? slugify(options.task)
    const uniqueName = `${name}-${id.slice(0, 6)}`

    const wtm = new WorktreeManager(options.repoPath)
    const { path: worktreePath, branch } = await wtm.create(uniqueName, baseBranch)

    this.worktreeManagers.set(id, wtm)

    const runnerType = options.runner ?? 'claude'
    let defaultModel = 'sonnet'
    if (runnerType === 'gemini') defaultModel = 'gemini-2.0-flash'
    if (runnerType === 'openai') defaultModel = 'gpt-4o'
    if (runnerType === 'opencode') defaultModel = 'latest'

    const agent: Agent = {
      id,
      task: options.task,
      repoPath: options.repoPath,
      baseBranch,
      branch,
      worktreePath,
      model: options.model ?? defaultModel,
      runner: runnerType,
      interactive: options.interactive ?? false,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }

    this.agents.set(id, agent)
    return structuredClone(agent)
  }

  /**
   * Start an agent — spawns the specified runner in the agent's worktree.
   */
  start(id: string): void {
    const agent = this.getInternal(id)

    if (agent.status === 'running') {
      throw new Error(`Agent ${id} is already running`)
    }

    let runner: Runner
    switch (agent.runner) {
      case 'gemini': runner = new GeminiRunner(); break
      case 'openai': runner = new OpenAIRunner(); break
      case 'opencode': runner = new OpenCodeRunner(); break
      default:
        runner = agent.interactive ? new PtyRunner() : new ClaudeRunner()
        break
    }
    this.runners.set(id, runner)

    agent.status = 'running'
    agent.startedAt = new Date().toISOString()
    agent.pid = undefined

    // Clear log buffer for this run
    this.logBuffers.set(id, [])

    this.emitEvent(agent, 'started', { message: `Agent started using ${agent.runner} on branch ${agent.branch}` })

    runner.on('log', (message: string) => {
      // Buffer for late-joining clients (page reload, new tab)
      const buf = this.logBuffers.get(id)!
      buf.push(message)
      if (buf.length > MAX_LOG_BUFFER) buf.shift()
      this.emitEvent(agent, 'log', { message })
    })

    runner.on('done', (result: { summary: string; costUsd?: number }) => {
      agent.status = 'completed'
      agent.completedAt = new Date().toISOString()
      agent.summary = result.summary
      agent.costUsd = result.costUsd
      this.runners.delete(id)
      this.emitEvent(agent, 'completed', {
        summary: result.summary,
        costUsd: result.costUsd,
      })
    })

    runner.on('error', (err: Error) => {
      agent.status = 'failed'
      agent.completedAt = new Date().toISOString()
      agent.error = err.message
      this.runners.delete(id)
      this.emitEvent(agent, 'failed', { error: err.message })
    })

    runner.start({
      task: agent.task,
      cwd: agent.worktreePath,
      model: agent.model,
    })
  }

  /**
   * Send text input to a running interactive agent (e.g. to answer Claude's question).
   */
  sendInput(id: string, text: string): void {
    const runner = this.runners.get(id)
    if (!runner) throw new Error(`Agent ${id} is not running`)
    if (!runner.sendInput) throw new Error(`Agent ${id} does not support interactive input`)
    runner.sendInput(text)
  }

  /**
   * Write raw key data to the PTY as-is (used by xterm.js web terminal).
   */
  sendRaw(id: string, data: string): void {
    const runner = this.runners.get(id)
    if (!runner) throw new Error(`Agent ${id} is not running`)
    if (!runner.writeRaw) throw new Error(`Agent ${id} does not support raw input`)
    runner.writeRaw(data)
  }

  /**
   * Return buffered log chunks for an agent (for page-reload replay).
   */
  getLogs(id: string): string[] {
    return [...(this.logBuffers.get(id) ?? [])]
  }

  /**
   * Assign a new task to a completed agent and restart it.
   */
  reassign(id: string, newTask: string): void {
    const agent = this.getInternal(id)

    if (agent.status === 'running') {
      throw new Error(`Agent ${id} is currently running. Stop it first.`)
    }

    agent.task = newTask
    agent.status = 'pending'
    agent.summary = undefined
    agent.error = undefined
    agent.completedAt = undefined

    this.start(id)
  }

  /**
   * Cancel a running agent.
   */
  cancel(id: string): void {
    const agent = this.getInternal(id)
    const runner = this.runners.get(id)

    if (runner) {
      runner.abort()
      this.runners.delete(id)
    }

    agent.status = 'cancelled'
    agent.completedAt = new Date().toISOString()
  }

  /**
   * Get a snapshot of an agent's current state.
   */
  get(id: string): Agent {
    return structuredClone(this.getInternal(id))
  }

  /**
   * List all agents.
   */
  list(): Agent[] {
    return Array.from(this.agents.values()).map(a => structuredClone(a))
  }

  /**
   * Merge an agent's branch into the base branch.
   */
  async merge(id: string): Promise<{ success: boolean; conflicts: string[] }> {
    const agent = this.getInternal(id)

    if (agent.status === 'running') {
      throw new Error(`Agent ${id} is still running`)
    }

    const wtm = this.worktreeManagers.get(id)
    if (!wtm) throw new Error(`No worktree manager for agent ${id}`)

    return wtm.merge(agent.branch)
  }

  /**
   * Remove an agent's worktree and branch. Cancels if running.
   */
  async remove(id: string): Promise<void> {
    const agent = this.getInternal(id)

    if (agent.status === 'running') {
      this.cancel(id)
    }

    const wtm = this.worktreeManagers.get(id)
    if (wtm) {
      const name = agent.branch.replace('qb/', '')
      await wtm.remove(name)
      this.worktreeManagers.delete(id)
    }

    this.logBuffers.delete(id)
    this.agents.delete(id)
  }

  /**
   * Remove all agents and clean up all worktrees.
   */
  async cleanup(repoPath: string): Promise<void> {
    for (const agent of this.agents.values()) {
      if (agent.repoPath === repoPath) {
        await this.remove(agent.id)
      }
    }
  }

  private getInternal(id: string): Agent {
    const agent = this.agents.get(id)
    if (!agent) throw new Error(`Agent ${id} not found`)
    return agent
  }

  private emitEvent(
    agent: Agent,
    type: AgentEvent['type'],
    data: AgentEvent['data']
  ): void {
    const event: AgentEvent = {
      agentId: agent.id,
      timestamp: new Date().toISOString(),
      type,
      data,
    }
    this.emit('event', event)
    this.emit(`event:${agent.id}`, event)
  }
}
