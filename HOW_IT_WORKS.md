# How QueenBee Works

QueenBee is a pnpm monorepo that lets you spawn and manage multiple AI coding agents (Claude Code, Gemini CLI, OpenAI Codex, OpenCode) in parallel, each working in its own git worktree, with a real-time web UI that shows a live terminal for each agent.

---

## Repository Layout

```
queenBee/
├── packages/
│   └── core/          # @queenbee/core — all agent logic (runners, manager, worktrees)
├── apps/
│   ├── cli/           # @queenbee/cli — terminal dashboard (Commander.js)
│   └── web/           # @queenbee/web — Next.js 14 web UI
└── pnpm-workspace.yaml
```

Both `cli` and `web` depend on `@queenbee/core` via `workspace:*`.

---

## Core Package (`packages/core`)

### Git Worktrees — `worktree.ts`

Every agent gets its own isolated copy of the repository via `git worktree`. When an agent is created:

1. A new branch is cut from the base branch (default: `main`).
2. A worktree is checked out to `.queenbee/<branch-name>` inside the repo.
3. The agent runs all its file edits inside that worktree — it cannot touch the main working tree.

When finished, the worktree can be merged back or discarded.

### Agent Runners

There are four runner implementations. All extend `EventEmitter` and emit the same three events: `log` (string), `done` (result), `error` (Error).

| Runner | File | How it works |
|---|---|---|
| `ClaudeRunner` | `claude-runner.ts` | Spawns `claude --print --output-format stream-json`. Parses the NDJSON stream line-by-line, extracts assistant text blocks and tool calls, and emits them as readable log strings. One-shot — no stdin. |
| `PtyRunner` | `pty-runner.ts` | Spawns `claude` in a real **pseudo-terminal** via `node-pty`. Emits raw PTY bytes (with ANSI escape codes). Supports bidirectional input: `sendInput(text)` appends `\r`; `writeRaw(data)` writes bytes as-is (used by the web terminal). |
| `GeminiRunner` | `gemini-runner.ts` | Spawns `gemini` CLI. |
| `OpenAIRunner` | `openai-runner.ts` | Spawns `openai` codex CLI. |
| `OpenCodeRunner` | `opencode-runner.ts` | Spawns `opencode` CLI. |

**Which runner is chosen:** For `runner: 'claude'`, `AgentManager` picks `PtyRunner` when `interactive: true`, otherwise `ClaudeRunner`. The other runners always use their dedicated class.

### Agent Manager — `agent-manager.ts`

`AgentManager` is the central coordinator. It holds three maps keyed by agent ID:

- `agents` — `Agent` state objects (status, branch, model, summary, etc.)
- `runners` — live runner instances while an agent is running
- `worktreeManagers` — one `WorktreeManager` per agent for git operations

Key methods:

| Method | What it does |
|---|---|
| `create(options)` | Creates a worktree + branch, stores a `pending` agent. Does not start it. |
| `start(id)` | Instantiates the right runner, wires up `log`/`done`/`error` events, calls `runner.start()`. |
| `sendInput(id, text)` | Calls `runner.sendInput(text)` — appends `\r` (Enter) and writes to PTY. |
| `sendRaw(id, data)` | Calls `runner.writeRaw(data)` — writes bytes exactly as received from xterm.js. |
| `cancel(id)` | Sends `SIGTERM` to the runner process. |
| `merge(id)` | Merges the agent's branch into the base branch via the worktree manager. |
| `remove(id)` | Deletes the worktree and branch. |

Every state change (started, log line, completed, failed) is emitted as an `AgentEvent` on the manager itself, which the web server listens to for SSE streaming.

### Types — `types.ts`

```ts
interface Agent {
  id, task, repoPath, baseBranch, branch, worktreePath,
  model, runner, status, interactive,
  createdAt, startedAt?, completedAt?,
  summary?, error?, costUsd?
}

interface AgentEvent {
  agentId: string
  timestamp: string
  type: 'started' | 'log' | 'completed' | 'failed'
  data: { message?, summary?, error?, costUsd? }
}
```

---

## Web App (`apps/web`)

Built with Next.js 14 App Router. All agent state lives server-side in a singleton `AgentManager`; the browser stays in sync via **Server-Sent Events**.

### Manager Singleton — `src/lib/manager.ts`

```ts
globalThis.agentManager ??= new AgentManager()
export const manager = globalThis.agentManager
```

`globalThis` is used so the singleton survives Next.js hot-module reloads in development. All API routes import this same instance.

### API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/agents` | GET | List all agents |
| `/api/agents` | POST | Create a new agent (calls `manager.create`) |
| `/api/agents/events` | GET | **SSE stream** — real-time event feed |
| `/api/agents/[id]/start` | POST | Start / rerun an agent |
| `/api/agents/[id]/cancel` | POST | Cancel a running agent |
| `/api/agents/[id]/input` | POST | Send input to an interactive agent |

#### SSE Event Stream — `/api/agents/events`

```
Browser                       Next.js API                    AgentManager
   |                              |                               |
   |--- GET /api/agents/events -->|                               |
   |                              |-- manager.on('event', fn) --> |
   |<-- : ping (initial) ---------|                               |
   |                              |                               |
   |                   agent starts, emits log                    |
   |                              |<-- emit('event', logEvent) ---|
   |<-- data: {"type":"log"} -----|                               |
   |<-- data: {"type":"log"} -----|                               |
   |                              |                               |
   |                   agent finishes                             |
   |<-- data: {"type":"completed"}|                               |
```

The stream uses `ReadableStream` with a 15-second keepalive ping so proxies and browsers don't close the idle connection. On stream cancel (browser disconnects), the event listener is removed.

#### Input Route — `/api/agents/[id]/input`

Accepts two request shapes:

```jsonc
// For the xterm.js terminal (raw PTY bytes, no '\r' appended)
{ "raw": "\u001b[A" }

// For programmatic text input (appends '\r' / Enter automatically)
{ "text": "yes" }
```

### React Hook — `src/hooks/use-agents.ts`

`useAgents()` opens a single `EventSource` connection and maintains all state:

```
EventSource('/api/agents/events')
  onmessage →
    type === 'log'       → append to logs[agentId]
    type === 'started'   → agent.status = 'running'
    type === 'completed' → agent.status = 'completed', agent.summary = ...
    type === 'failed'    → agent.status = 'failed', agent.error = ...
    unknown agentId      → re-fetch full agent list
```

Exposed functions: `createAgent`, `startAgent`, `cancelAgent`, `sendInput`, `sendRaw`, `refresh`.

### Web Terminal — `src/components/TerminalPane.tsx`

Each agent card embeds a real terminal emulator using **xterm.js** (`@xterm/xterm`).

**Initialization:**  
xterm is dynamically imported (client-side only) inside a `useEffect`. A `FitAddon` is loaded to size the terminal to its container. The terminal is created with `disableStdin: !interactive` — non-interactive agents show output only; interactive ones accept keyboard input.

**Rendering output:**  
The component receives `logs: string[]` from the hook — raw PTY bytes that may contain ANSI escape codes (colors, cursor movement, clearing). xterm renders these natively. A ref tracks the last written index so only new chunks are written on each render cycle. When the array resets to empty (agent reruns), the terminal is cleared.

**Sending input:**  
xterm's `onData` callback fires on every keystroke with the exact byte sequence (e.g. `\r` for Enter, `\x03` for Ctrl+C, `\x1b[A` for Up arrow). For `interactive + running` agents, these bytes are POSTed to `/api/agents/[id]/input` as `{ raw: data }`, which the server passes directly to `node-pty` — no modification, no extra newline.

### UI Component — `src/components/AgentOrchestrator.tsx`

The main page renders:
- **Sidebar** — form to spawn a new agent (task, repo path, runner, interactive toggle)
- **Agent cards** — one per agent, showing status, metadata, and an embedded `TerminalPane`

Terminal is auto-opened when an agent starts running. Interactive agents show a hint to click the terminal and type.

---

## End-to-End Flow

### Non-interactive agent (default)

```
1. User fills form → POST /api/agents → manager.create() → git worktree created
2. User clicks Start → POST /api/agents/:id/start → manager.start()
3. ClaudeRunner spawns: claude --print --output-format stream-json <task>
4. Runner parses NDJSON → emits 'log' strings (plain text + emoji annotations)
5. AgentManager emits 'event' {type:'log', data:{message}}
6. SSE stream → browser EventSource → useAgents hook → logs[agentId] grows
7. TerminalPane.useEffect([logs]) → term.write(newChunk) → text appears in xterm
8. On exit 0: runner emits 'done' → manager emits 'completed' → UI updates status
```

### Interactive agent (PTY mode)

```
1-2. Same as above but with interactive: true checked
3. PtyRunner spawns: claude --dangerously-skip-permissions --model sonnet <task>
   in a real PTY (120 cols × 30 rows, xterm-256color)
4. PTY stdout → PtyRunner emits 'log' with raw bytes (ANSI escape codes included)
5. SSE → browser → TerminalPane → term.write() → full color terminal output

When Claude asks a question / user wants to type:
6. User clicks the xterm terminal div and types
7. xterm.onData(rawBytes) fires → POST /api/agents/:id/input {raw: rawBytes}
8. API route → manager.sendRaw() → runner.writeRaw() → ptyProcess.write(rawBytes)
9. Claude's process receives keystrokes, responds → loop back to step 4
```

---

## Key Design Decisions

**SSE over WebSockets** — Server-Sent Events are simpler for unidirectional server→client streaming, work through proxies without special handling, and reconnect automatically. WebSockets would only be needed if the browser needed to push a high-bandwidth stream to the server, which we don't (input is just small HTTP POSTs).

**`raw` vs `text` input** — xterm sends exact byte sequences including the newline character. If the server appended another `\r`, Claude would see a double Enter. The `raw` path passes bytes through untouched. The `text` path (legacy) is kept for programmatic use where callers send a line without a newline.

**PTY for interactive mode** — `node-pty` creates a real kernel pseudo-terminal. This means Claude's interactive prompts, spinner animations, and colored output all work exactly as they would in a real terminal. A regular `child_process.spawn` pipe would break interactive programs that check if stdin is a TTY.

**git worktrees** — Each agent works in an isolated checkout so multiple agents can edit different branches of the same repo simultaneously without conflicts. Merging is an explicit step after review.

**xterm.js dynamic import** — The library manipulates the DOM directly and cannot run on the server. Putting it in a `useEffect` with a dynamic `import()` ensures it only initialises in the browser, keeping Next.js SSR happy.
