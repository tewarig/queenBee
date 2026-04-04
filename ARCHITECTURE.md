# QueenBee Architecture

> Spawn parallel AI coding agents, each in its own git worktree.

## Overview

QueenBee lets you spin up multiple Claude Code agents in parallel, each working on its own task in an isolated git worktree. **You** define the tasks — "build login", "add dashboard", "fix PR review comments" — and each agent picks up its task and works end-to-end, independently.

No auto-decomposition, no orchestrator deciding what to do. You're the queen bee — you assign the work, agents execute it.

**Examples:**
- Agent 1: "Build login page with auth flow" → works in `qb/login` worktree
- Agent 2: "Build analytics dashboard" → works in `qb/dashboard` worktree
- Agent 3: "Fix review comments from PR #42" → works in `qb/pr-42-fixes` worktree

All running in parallel, on the same repo, without stepping on each other.

---

## Package Structure (Simplified)

```
queenBee/
├── apps/
│   ├── cli/              # @queenbee/cli — terminal interface (later)
│   └── web/              # @queenbee/web — dashboard UI (later)
└── packages/
    └── core/             # @queenbee/core — ALL the logic lives here first
```

**Strategy:** Build everything in `packages/core` first. CLI and web UI consume it later.

---

## Core Library (`@queenbee/core`)

### What it does

1. **Creates a git worktree** for each agent (isolated branch, isolated directory)
2. **Spawns a Claude Code process** (`claude --print`) in that worktree
3. **Streams progress** from each agent in real-time
4. **Tracks state** of all running agents (SQLite)
5. **Cleans up** worktrees when agents finish

### Module Breakdown

```
packages/core/src/
├── index.ts                # Public API — re-exports everything
├── types.ts                # All shared types
├── agent-manager.ts        # Top-level API: create/start/stop/list agents
├── claude-runner.ts        # Spawns `claude --print` processes, streams output
├── worktree.ts             # Git worktree create/remove/list/merge
├── store.ts                # SQLite persistence (agent state, logs, history)
└── schema.sql              # DB table definitions
```

---

## Key Types

```typescript
type AgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

interface Agent {
  id: string
  task: string              // User-defined task description
  repoPath: string          // Path to the target repo
  baseBranch: string        // Branch to create worktree from (e.g. "main")
  branch: string            // Agent's working branch (e.g. "qb/login")
  worktreePath: string      // Absolute path to the worktree directory
  model: string             // "sonnet" | "opus" | full model ID
  status: AgentStatus
  createdAt: string
  startedAt?: string
  completedAt?: string
  summary?: string          // Agent's self-reported summary on completion
  filesChanged?: string[]
  error?: string
  costUsd?: number
}

interface CreateAgentOptions {
  task: string              // "Build login page with auth"
  repoPath: string          // "/Users/me/myproject"
  baseBranch?: string       // Default: "main"
  branchName?: string       // Default: auto-generated from task (e.g. "qb/login")
  model?: string            // Default: "sonnet"
  maxBudgetUsd?: number     // Optional cost cap
  systemPrompt?: string     // Optional extra instructions
}

interface AgentEvent {
  agentId: string
  timestamp: string
  type: 'started' | 'progress' | 'log' | 'completed' | 'failed'
  data: {
    message?: string
    percent?: number
    summary?: string
    filesChanged?: string[]
    error?: string
  }
}
```

---

## How It Works

### 1. Create an Agent

```typescript
const manager = new AgentManager()

const agent = await manager.create({
  task: "Build a login page with email/password auth",
  repoPath: "/Users/me/myproject",
  branchName: "qb/login",
  model: "sonnet",
})
// → Creates git worktree at /Users/me/myproject/.queenbee/worktrees/qb-login
// → Creates branch qb/login from main
// → Saves agent to SQLite
```

### 2. Start the Agent

```typescript
await manager.start(agent.id)
// → Spawns: claude --print --model sonnet --output-format stream-json \
//           --max-budget-usd 2.00 \
//           "Build a login page with email/password auth"
// → Working directory: the worktree path
// → Streams stdout JSON events → updates store + emits events
```

### 3. Run Multiple in Parallel

```typescript
const login = await manager.create({ task: "Build login page", repoPath, model: "sonnet" })
const dashboard = await manager.create({ task: "Build dashboard", repoPath, model: "sonnet" })
const prFixes = await manager.create({ task: "Fix PR #42 review comments", repoPath, model: "opus" })

// Start all three — they run in parallel, each in its own worktree
await Promise.all([
  manager.start(login.id),
  manager.start(dashboard.id),
  manager.start(prFixes.id),
])
```

### 4. Monitor Progress

```typescript
// Poll
const agents = manager.list()
agents.forEach(a => console.log(`${a.branch}: ${a.status}`))

// Or stream events
manager.on('event', (event: AgentEvent) => {
  console.log(`[${event.agentId}] ${event.type}: ${event.data.message}`)
})
```

### 5. When Done

Each agent commits its work to its branch. You can then:
- Review the branch diff
- Merge into main
- Or let QueenBee merge for you

```typescript
// Merge a completed agent's branch
await manager.merge(agent.id) // merges qb/login → main

// Or cleanup without merging
await manager.cleanup(agent.id) // removes worktree + branch
```

---

## Git Worktree Strategy

```
/Users/me/myproject/                    ← main repo (your normal working dir)
/Users/me/myproject/.queenbee/
    ├── queenbee.db                     ← SQLite state
    └── worktrees/
        ├── qb-login/                   ← worktree for login agent (branch: qb/login)
        ├── qb-dashboard/              ← worktree for dashboard agent (branch: qb/dashboard)
        └── qb-pr-42-fixes/            ← worktree for PR fixes agent (branch: qb/pr-42-fixes)
```

- Each worktree is a full copy of the repo on its own branch
- Agents can edit any files without conflicting with each other
- Branches are prefixed with `qb/` for easy identification
- Worktrees live under `.queenbee/worktrees/` (add to `.gitignore`)

---

## Claude Code Integration

Each agent runs Claude Code via `claude --print` with these flags:

```bash
claude --print \
  --model sonnet \
  --output-format stream-json \
  --max-budget-usd 2.00 \
  "Build a login page with email/password auth"
```

| Flag | Purpose |
|---|---|
| `--print` | Non-interactive mode — runs task and exits |
| `--model` | Choose Opus, Sonnet, or Haiku per agent |
| `--output-format stream-json` | Real-time JSON events on stdout |
| `--max-budget-usd` | Cost cap per agent |
| `--append-system-prompt` | Optional extra instructions |

The streaming JSON gives us progress events that we parse and store.

---

## Persistence (SQLite)

Single DB at `<repo>/.queenbee/queenbee.db`.

### Tables

**`agents`** — one row per agent
```sql
CREATE TABLE agents (
  id            TEXT PRIMARY KEY,
  task          TEXT NOT NULL,
  repo_path     TEXT NOT NULL,
  base_branch   TEXT NOT NULL,
  branch        TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  model         TEXT NOT NULL,
  status        TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  started_at    TEXT,
  completed_at  TEXT,
  summary       TEXT,
  files_changed TEXT,  -- JSON array
  error         TEXT,
  cost_usd      REAL
);
```

**`agent_logs`** — append-only log per agent
```sql
CREATE TABLE agent_logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id  TEXT NOT NULL REFERENCES agents(id),
  timestamp TEXT NOT NULL,
  type      TEXT NOT NULL,
  data      TEXT NOT NULL,  -- JSON
);
```

---

## Implementation Plan

### Phase 1: Core Library (current focus)

Build everything in `packages/core`:

1. **`types.ts`** — Agent, CreateAgentOptions, AgentEvent types
2. **`worktree.ts`** — WorktreeManager: create/remove/list/merge git worktrees
3. **`claude-runner.ts`** — ClaudeRunner: spawn `claude --print`, parse stream-json, emit events
4. **`store.ts`** — AgentStore: SQLite CRUD for agents and logs
5. **`agent-manager.ts`** — AgentManager: top-level API tying it all together
6. **`index.ts`** — Public exports

### Phase 2: CLI
- `qb agent create <task> --repo <path>` — create an agent
- `qb agent start <id>` — start an agent
- `qb agent list` — show all agents
- `qb agent logs <id>` — stream logs
- `qb agent merge <id>` — merge completed agent's branch
- `qb agent cancel <id>` — cancel running agent
- `qb agent cleanup` — remove all worktrees

### Phase 3: Web UI
- Dashboard showing all agents and their status
- Create new agent form
- Real-time log streaming per agent
- Branch diff viewer
- Merge button

---

## Error Handling

- **Agent crash:** Status set to `failed`, worktree preserved for inspection. User can retry or cleanup.
- **Budget exceeded:** Claude Code handles this natively via `--max-budget-usd` — process exits, we capture the exit status.
- **Merge conflicts:** Attempt auto-merge. If conflicts, report which files conflict and let user resolve (or spawn another agent to resolve).
- **Worktree cleanup on failure:** `qb agent cleanup` removes all `.queenbee/worktrees/*` and deletes `qb/*` branches.
- **Rate limits:** Retry with backoff (handled by Claude Code internally).
