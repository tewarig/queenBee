# 🐝 QueenBee

> Orchestrate multiple AI coding agents from a single command center.

QueenBee lets you spawn, manage, and interact with multiple AI agents (Claude Code, Gemini CLI, OpenAI Codex, and more) running in parallel across different git worktrees — all from one place, with a real-time web terminal for each agent.

---

## Demo

## 🎥 Demo

<p align="center">
  <a href="https://youtu.be/tHghPDicPZo">
    <img src="https://img.youtube.com/vi/tHghPDicPZo/maxresdefault.jpg" width="600"/>
  </a>
</p>
> Spawn an interactive Claude Code agent, watch it work in real time, and type directly into the terminal to guide it.

---

## What it does

- **Parallel agents** — each agent gets its own isolated git worktree so multiple agents can edit different branches of the same repo simultaneously without conflicts.
- **Real-time web terminal** — xterm.js renders the exact PTY output (colors, cursor, spinners) that you'd see in a real terminal.
- **Interactive mode** — click the in-browser terminal and type to reply to Claude mid-task, just like you would in a local terminal session.
- **Log replay** — page reloads don't wipe the terminal; buffered output is replayed immediately.
- **Multi-runner** — swap between Claude Code, Gemini CLI, OpenAI Codex, and Open Code without changing anything else.

---

## Structure

pnpm monorepo with three packages:

```
queenBee/
├── apps/
│   ├── cli/          # qb — command-line interface
│   └── web/          # Next.js 14 web dashboard
└── packages/
    └── core/         # Agent orchestration, PTY runners, git worktrees
```

| Package | Name | Role |
|---|---|---|
| `packages/core` | `@queenbee/core` | `AgentManager`, `PtyRunner`, `ClaudeRunner`, `WorktreeManager` |
| `apps/cli` | `@queenbee/cli` | `qb` binary — spawn and monitor agents from the terminal |
| `apps/web` | `@queenbee/web` | Next.js dashboard with SSE streaming and xterm.js terminal |

---

## Getting Started

**Prerequisites:** Node.js ≥ 20, pnpm ≥ 9, and at least one AI CLI installed (`claude`, `gemini`, `openai`, or `opencode`).

```bash
git clone https://github.com/tewarig/queenBee
cd queenBee
pnpm install
```

### Web UI

```bash
pnpm --filter @queenbee/web dev
# Open http://localhost:3000
```

### CLI

```bash
# Install the qb command globally
pnpm cli:install

# Or run in dev mode (auto-rebuilds on changes)
pnpm cli:dev
```

---

## Web UI

The dashboard has a compact spawn bar at the top and full-width agent cards below.

**Spawn bar fields:**
| Field | Description |
|---|---|
| Task | What the agent should do |
| Repo Path | Absolute path to the git repo |
| Runner | Which AI CLI to use |
| Interactive | Enable PTY mode so you can type back to the agent |

**Agent card:**
- Status badge (pending / running / completed / failed / cancelled)
- Live terminal with full ANSI color rendering
- Click the terminal and type to interact (interactive mode only)
- Cancel, Rerun buttons

---

## CLI Usage

```bash
# Spawn a new agent
qb spawn "Refactor auth module" --repo /path/to/project --runner claude

# Spawn in interactive mode
qb spawn "Fix the failing tests" --interactive

# List all agents
qb list

# Start a pending agent and stream its logs
qb start <id> --follow

# Send text input to a running interactive agent
qb input <id> "yes, proceed"

# Cancel a running agent
qb cancel <id>

# Merge an agent's branch back into main
qb merge <id>

# Remove an agent and its worktree
qb remove <id>
```

---

## Supported Runners

| Runner | Flag | Default model | Notes |
|---|---|---|---|
| Claude Code | `--runner claude` | `sonnet` | Default. Non-interactive uses `--print` + stream-json; interactive uses a real PTY |
| Gemini CLI | `--runner gemini` | `gemini-2.0-flash` | |
| OpenAI Codex | `--runner openai` | `gpt-4o` | |
| Open Code | `--runner opencode` | `latest` | |

---

## How it works

See [HOW_IT_WORKS.md](./HOW_IT_WORKS.md) for a full walkthrough of the architecture — runners, SSE streaming, xterm.js integration, git worktree isolation, and the interactive PTY input path.

---

## Testing

```bash
# Run all tests with coverage
pnpm --filter "@queenbee/*" test:coverage
```

Coverage is maintained above 90% across all packages.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Package manager | pnpm workspaces |
| CLI | Commander.js · Chalk · Ora |
| Web | Next.js 14 · React 18 |
| Terminal emulator | xterm.js (`@xterm/xterm`) |
| PTY | node-pty |
| Streaming | Server-Sent Events (SSE) |
| Testing | Vitest |

---

## License

MIT
