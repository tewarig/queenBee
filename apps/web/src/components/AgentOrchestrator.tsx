'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAgents } from '@/hooks/use-agents'
import { TerminalPane } from '@/components/TerminalPane'
import type { Agent } from '@queenbee/core'

export function AgentOrchestrator() {
  const { agents, logs, loading, createAgent, startAgent, cancelAgent, sendRaw, refresh } = useAgents()
  const [task, setTask] = useState('')
  const [repoPath, setRepoPath] = useState('/Users/gauravtewari/Desktop/queenBee') // default to current project for demo
  const [runner, setRunner] = useState('claude')
  const [interactive, setInteractive] = useState(true)
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)
    try {
      await createAgent({ task, repoPath, runner, interactive })
      setTask('')
    } finally {
      setIsCreating(false)
    }
  }

  if (loading && agents.length === 0) {
    return <div className="loading">Loading agents...</div>
  }

  return (
    <div className="container">
      <header className="header">
        <h1>QueenBee</h1>
        <button className="btn btn-secondary" onClick={() => refresh()}>Refresh</button>
      </header>

      {/* Spawn form — compact horizontal bar at the top */}
      <form onSubmit={handleCreate} className="spawn-bar">
        <div className="field field-task">
          <label htmlFor="task-input">Task</label>
          <textarea
            id="task-input"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Explain what the agent should do..."
            rows={2}
            required
          />
        </div>
        <div className="field field-repo">
          <label htmlFor="repo-path">Repo Path</label>
          <input
            id="repo-path"
            type="text"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            required
          />
        </div>
        <div className="field field-runner">
          <label htmlFor="runner-select">Runner</label>
          <select
            id="runner-select"
            value={runner}
            onChange={(e) => setRunner(e.target.value)}
          >
            <option value="claude">Claude Code</option>
            <option value="gemini">Gemini CLI</option>
            <option value="openai">OpenAI Codex</option>
            <option value="opencode">Open Code</option>
          </select>
        </div>
        <div className="field field-interactive">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={interactive}
              onChange={(e) => setInteractive(e.target.checked)}
            />
            <span>Interactive</span>
          </label>
        </div>
        <div className="field field-submit">
          <button type="submit" className="btn btn-primary" disabled={isCreating}>
            {isCreating ? 'Spawning…' : 'Spawn Agent'}
          </button>
        </div>
      </form>

      {/* Agent list — full width below */}
      <div className="agent-list">
        {agents.length === 0 ? (
          <p className="empty-state">No agents spawned yet. Create one above.</p>
        ) : (
          agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              logs={logs[agent.id] || []}
              onStart={() => startAgent(agent.id)}
              onCancel={() => cancelAgent(agent.id)}
              onSendRaw={(data) => sendRaw(agent.id, data)}
            />
          ))
        )}
      </div>

      <style jsx>{`
        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 1.25rem 2rem 3rem;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid #e5e7eb;
        }
        .header h1 {
          font-size: 1.4rem;
          margin: 0;
        }

        /* ── Spawn bar ── */
        .spawn-bar {
          display: flex;
          gap: 0.75rem;
          align-items: flex-end;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 1rem 1.25rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .field label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #374151;
        }
        .field-task { flex: 3; min-width: 220px; }
        .field-repo { flex: 2; min-width: 180px; }
        .field-runner { flex: 1; min-width: 130px; }
        .field-interactive { justify-content: flex-end; padding-bottom: 0.2rem; }
        .field-submit { justify-content: flex-end; }

        .field textarea,
        .field input[type="text"],
        .field select {
          padding: 0.5rem 0.65rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-family: inherit;
          font-size: 0.875rem;
          box-sizing: border-box;
          width: 100%;
          background: white;
        }
        .field textarea { resize: none; line-height: 1.4; }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          cursor: pointer;
          font-size: 0.8rem;
          font-weight: 500;
          color: #374151;
          white-space: nowrap;
        }
        .checkbox-label input[type="checkbox"] { width: auto; margin: 0; }

        .btn {
          padding: 0.55rem 1.1rem;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.875rem;
          transition: background 0.15s;
          white-space: nowrap;
        }
        .btn-primary { background: #0070f3; color: white; }
        .btn-primary:hover { background: #0051bb; }
        .btn-primary:disabled { background: #93c5fd; cursor: not-allowed; }
        .btn-secondary { background: #f3f4f6; color: #374151; }
        .btn-secondary:hover { background: #e5e7eb; }

        /* ── Agent list ── */
        .agent-list {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .empty-state {
          color: #9ca3af;
          font-style: italic;
          text-align: center;
          padding: 3rem;
          background: #fafafa;
          border: 1px dashed #e5e7eb;
          border-radius: 10px;
        }
      `}</style>
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  pending:   '#6b7280',
  running:   '#3b82f6',
  completed: '#10b981',
  failed:    '#ef4444',
  cancelled: '#f59e0b',
}

function AgentCard({ agent, logs, onStart, onCancel, onSendRaw }: {
  agent: Agent
  logs: string[]
  onStart: () => void
  onCancel: () => void
  onSendRaw: (data: string) => void
}) {
  const [showTerminal, setShowTerminal] = useState(false)
  const statusColor = STATUS_COLORS[agent.status] ?? '#6b7280'
  const running = agent.status === 'running'

  // Stable callback so TerminalPane doesn't re-render unnecessarily
  const handleData = useCallback((data: string) => {
    onSendRaw(data)
  }, [onSendRaw])

  // Auto-open terminal when agent starts
  useEffect(() => {
    if (agent.status === 'running') setShowTerminal(true)
  }, [agent.status])

  return (
    <div className="agent-card">
      <div className="agent-header">
        <div className="agent-header-left">
          <span className="status-dot" style={{ background: statusColor }} />
          <span className="status-text" style={{ color: statusColor }}>{agent.status}</span>
          <span className="agent-id">{agent.id.slice(0, 8)}</span>
          <span className="runner-badge">{agent.runner}</span>
          {agent.interactive && <span className="interactive-badge">interactive</span>}
        </div>
        <div className="actions">
          <button
            onClick={() => setShowTerminal(v => !v)}
            className="btn-small btn-secondary"
          >
            {showTerminal ? 'Hide Terminal' : 'Show Terminal'}
          </button>
          {agent.status === 'pending' && (
            <button onClick={onStart} className="btn-small btn-start">Start</button>
          )}
          {running && (
            <button onClick={onCancel} className="btn-small btn-cancel">Cancel</button>
          )}
          {(agent.status === 'completed' || agent.status === 'failed') && (
            <button onClick={onStart} className="btn-small btn-start">Rerun</button>
          )}
        </div>
      </div>

      <div className="agent-body">
        <p className="task-title">{agent.task}</p>
        <div className="meta">
          <span>Branch: <code>{agent.branch}</code></span>
          <span>Model: <code>{agent.model}</code></span>
        </div>

        {agent.summary && (
          <div className="summary">
            <strong>Summary:</strong> {agent.summary}
          </div>
        )}
        {agent.error && (
          <div className="error-box">
            <strong>Error:</strong> {agent.error}
          </div>
        )}

        {showTerminal && (
          <TerminalPane
            logs={logs}
            interactive={agent.interactive ?? false}
            running={running}
            onData={handleData}
          />
        )}
      </div>

      <style jsx>{`
        .agent-card {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 1.25rem;
          background: white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }
        .agent-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }
        .agent-header-left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .status-text {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .runner-badge {
          background: #f3f4f6;
          padding: 0.15rem 0.5rem;
          border-radius: 4px;
          font-size: 0.7rem;
          color: #6b7280;
          font-family: monospace;
        }
        .interactive-badge {
          background: #eff6ff;
          color: #3b82f6;
          padding: 0.15rem 0.5rem;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 600;
        }
        .agent-id {
          font-size: 0.8rem;
          color: #9ca3af;
          font-family: monospace;
        }
        .actions {
          display: flex;
          gap: 0.4rem;
          align-items: center;
        }
        .task-title {
          margin: 0 0 0.5rem 0;
          font-size: 0.95rem;
          font-weight: 500;
          color: #111;
        }
        .meta {
          font-size: 0.8rem;
          color: #6b7280;
          display: flex;
          gap: 1rem;
        }
        .meta code {
          background: #f3f4f6;
          padding: 0.1rem 0.3rem;
          border-radius: 3px;
          font-size: 0.75rem;
        }
        .summary {
          margin-top: 0.75rem;
          padding: 0.75rem;
          background: #f0fdf4;
          border-radius: 6px;
          border-left: 3px solid #10b981;
          font-size: 0.875rem;
        }
        .error-box {
          margin-top: 0.75rem;
          padding: 0.75rem;
          background: #fef2f2;
          border-radius: 6px;
          border-left: 3px solid #ef4444;
          font-size: 0.875rem;
          color: #dc2626;
        }
        .btn-small {
          padding: 0.35rem 0.75rem;
          border-radius: 5px;
          border: none;
          cursor: pointer;
          font-size: 0.8rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 0.3rem;
        }
        .btn-start { background: #10b981; color: white; }
        .btn-cancel { background: #ef4444; color: white; }
        .btn-secondary { background: #f3f4f6; color: #374151; }
      `}</style>
    </div>
  )
}
