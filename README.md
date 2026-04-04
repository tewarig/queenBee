# 🐝 QueenBee

> Orchestrate multiple AI agents from a single command center.

QueenBee is a developer tool that lets you spawn, manage, and monitor multiple AI agents (Claude, Gemini, OpenAI, etc.) across different projects — all from one place. Whether you're context-switching between repos or running parallel AI-assisted workflows, QueenBee keeps everything under control.

---

## Why QueenBee?

AI coding agents are powerful, but managing multiple simultaneous tasks across different repositories can be difficult. QueenBee acts as the queen of the hive — directing worker bees (AI agents) across your codebase, so you can:

- Run **parallel AI sessions** across different repos using git worktrees.
- Switch between projects without losing context.
- Get a **unified view** of all running agents via CLI or real-time Web UI.
- Support for multiple AI ecosystems (Claude, Gemini, OpenAI, Open Code).

---

## Structure

This is a **pnpm monorepo** with the following packages:

```
queenBee/
├── apps/
│   ├── cli/          # qb — command-line interface
│   └── web/          # Next.js dashboard
└── packages/
    └── core/         # Shared agent management logic
```

| Package | Name | Description |
|---|---|---|
| `packages/core` | `@queenbee/core` | `AgentManager` class — spawns and controls AI processes |
| `apps/cli` | `@queenbee/cli` | `qb` CLI binary — manage agents from your terminal |
| `apps/web` | `@queenbee/web` | Web dashboard — visual overview with real-time logs |

---

## Getting Started

**Prerequisites:** Node.js ≥ 20, pnpm ≥ 9

### Installation (Global CLI)

To install the QueenBee CLI (`qb`) globally for local testing:

```bash
pnpm cli:install
```

This will build the project and link the `qb` command globally.

### Local Development

Start a development environment where the core package and CLI are automatically rebuilt on changes:

```bash
pnpm cli:dev
```

Run the Web UI in development mode:

```bash
pnpm --filter @queenbee/web dev
# Open http://localhost:3000
```

---

## Supported Runners

QueenBee supports orchestrating agents across multiple AI ecosystems:

- **Claude Code**: (Default) Uses the `claude` CLI.
- **Gemini CLI**: Uses the `gemini` CLI.
- **OpenAI Codex**: Uses the `openai` CLI (configured for `gpt-4o`).
- **Open Code**: Uses the `opencode` CLI.

---

## CLI Usage

```bash
# Spawn a new agent for a task
qb spawn "Fix navigation bug" --runner gemini

# List all agents
qb list

# Start an agent and follow live logs
qb start <id> --follow

# Cancel a running agent
qb cancel <id>

# Remove an agent and its worktree
qb remove <id>
```

---

## Testing & Coverage

We maintain high testing standards with over 90% workspace-wide coverage.

```bash
# Run tests and generate coverage reports for all packages
pnpm --filter "@queenbee/*" test:coverage
```

---

## Tech Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Package manager:** pnpm workspaces
- **CLI:** Commander.js + Chalk + Ora
- **Web:** Next.js 14 + React 18
- **Testing:** Vitest

---

## Contributing

This project is in early development. Ideas, issues, and PRs are welcome.

---

## License

MIT
