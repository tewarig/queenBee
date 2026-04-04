export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type RunnerType = 'claude' | 'gemini' | 'openai' | 'opencode'

export interface Agent {
  id: string
  task: string
  repoPath: string
  baseBranch: string
  branch: string
  worktreePath: string
  model: string
  runner: RunnerType
  status: AgentStatus
  pid?: number
  createdAt: string
  startedAt?: string
  completedAt?: string
  summary?: string
  filesChanged?: string[]
  error?: string
  costUsd?: number
}

export interface CreateAgentOptions {
  task: string
  repoPath: string
  baseBranch?: string       // default: "main"
  branchName?: string       // default: auto-derived from task
  model?: string            // default: "sonnet" for claude, "gemini-2.0-flash" for gemini
  runner?: RunnerType       // default: "claude"
  maxBudgetUsd?: number
  appendSystemPrompt?: string
}

export interface AgentEvent {
  agentId: string
  timestamp: string
  type: 'started' | 'log' | 'completed' | 'failed'
  data: {
    message?: string
    summary?: string
    filesChanged?: string[]
    error?: string
    costUsd?: number
  }
}
