# 🐝 QueenBee

> Orchestrate multiple Claude Code instances from a single command center.

QueenBee is a developer tool that lets you spawn, manage, and monitor multiple [Claude Code](https://claude.ai/code) instances across different projects — all from one place. Whether you're context-switching between repos or running parallel AI-assisted workflows, QueenBee keeps everything under control.

---

## Why QueenBee?

Claude Code is powerful on its own. But when you're working across multiple projects simultaneously, switching contexts gets messy. QueenBee acts as the queen of the hive — directing worker bees (Claude Code instances) across your codebase, so you can:

- Run **parallel Claude Code sessions** across different repos
- Switch between projects without losing context
- Get a **unified view** of all running instances via CLI or web UI
- (Coming soon) Persistent **memory layer** that tracks intent and context across sessions

---

## Structure

This is a **pnpm monorepo** with the following packages:

```
queenBee/
├── apps/
│   ├── cli/          # qb — command-line interface
│   └── web/          # Next.js dashboard
└── packages/
    └── core/         # Shared instance management logic
```

| Package | Name | Description |
|---|---|---|
| `packages/core` | `@queenbee/core` | `InstanceManager` class — spawns, tracks, and controls Claude Code processes |
| `apps/cli` | `@queenbee/cli` | `qb` CLI binary — manage instances from your terminal |
| `apps/web` | `@queenbee/web` | Web dashboard — visual overview of all instances |

---

## Getting Started

**Prerequisites:** Node.js ≥ 20, pnpm ≥ 9, Claude Code installed (`claude` in PATH)

```bash
# Clone the repo
git clone https://github.com/tewarig/queenBee.git
cd queenBee

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### CLI

```bash
# Spawn a new instance for a project
qb spawn /path/to/your/project --name my-project

# Start it
qb start <instance-id>

# List all instances
qb list

# Stop an instance
qb stop <instance-id>

# Remove an instance
qb remove <instance-id>
```

### Web UI

```bash
pnpm --filter @queenbee/web dev
# Open http://localhost:3000
```

---

## Roadmap

- [x] Monorepo scaffold (pnpm workspaces + TypeScript)
- [x] Core `InstanceManager` — spawn/start/stop/list Claude Code processes
- [x] `qb` CLI with full instance lifecycle commands
- [x] Next.js web UI shell
- [ ] Web dashboard — live instance status, logs, controls
- [ ] Persistent daemon — state survives CLI restarts
- [ ] Memory layer — tracks what you're working on across instances
- [ ] Multi-project context switching
- [ ] Instance-to-instance communication

---

## Tech Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Package manager:** pnpm workspaces
- **CLI:** Commander.js + Chalk + Ora
- **Web:** Next.js 14 + React 18

---

## Contributing

This project is in early development. Ideas, issues, and PRs are welcome.

---

## License

MIT
