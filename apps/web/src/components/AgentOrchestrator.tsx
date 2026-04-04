'use client'

import { useState, useEffect, useRef } from 'react'
import { useAgents } from '@/hooks/use-agents'
import type { Agent } from '@queenbee/core'

export function AgentOrchestrator() {
  const { agents, logs, loading, createAgent, startAgent, cancelAgent, refresh } = useAgents()
  const [task, setTask] = useState('')
  const [repoPath, setRepoPath] = useState('/Users/gauravtewari/Desktop/queenBee') // default to current project for demo
  const [runner, setRunner] = useState('claude')
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)
    try {
      await createAgent({ task, repoPath, runner })
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
        <h1>QueenBee Agent Orchestrator</h1>
        <button className="btn btn-secondary" onClick={() => refresh()}>Refresh</button>
      </header>

      <div className="grid">
        <aside className="sidebar">
          <form onSubmit={handleCreate} className="create-form">
            <h2>Spawn New Agent</h2>
            <div className="form-group">
              <label htmlFor="task-input">Task</label>
              <textarea 
                id="task-input"
                value={task} 
                onChange={(e) => setTask(e.target.value)}
                placeholder="Explain what the agent should do..."
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="repo-path">Repo Path</label>
              <input 
                id="repo-path"
                type="text" 
                value={repoPath} 
                onChange={(e) => setRepoPath(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="runner-select">Runner</label>
              <select 
                id="runner-select"
                value={runner} 
                onChange={(e) => setRunner(e.target.value)}
                className="select-input"
              >
                <option value="claude">Claude Code</option>
                <option value="gemini">Gemini CLI</option>
                <option value="openai">OpenAI Codex</option>
                <option value="opencode">Open Code</option>
              </select>
            </div>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={isCreating}
            >
              {isCreating ? 'Spawning...' : 'Spawn Agent'}
            </button>
          </form>
        </aside>

        <main className="content">
          <div className="agent-list">
            {agents.length === 0 ? (
              <p className="empty-state">No agents spawned yet.</p>
            ) : (
              agents.map((agent) => (
                <AgentCard 
                  key={agent.id} 
                  agent={agent} 
                  logs={logs[agent.id] || []}
                  onStart={() => startAgent(agent.id)}
                  onCancel={() => cancelAgent(agent.id)}
                />
              ))
            )}
          </div>
        </main>
      </div>

      <style jsx>{`
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          border-bottom: 1px solid #eee;
          padding-bottom: 1rem;
        }
        .grid {
          display: grid;
          grid-template-columns: 350px 1fr;
          gap: 2rem;
        }
        .sidebar {
          background: #f9f9f9;
          padding: 1.5rem;
          border-radius: 8px;
          border: 1px solid #ddd;
          height: fit-content;
        }
        .create-form h2 {
          margin-top: 0;
          font-size: 1.25rem;
        }
        .form-group {
          margin-bottom: 1rem;
        }
        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 600;
          font-size: 0.875rem;
        }
        .form-group textarea, .form-group input, .select-input {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-family: inherit;
          box-sizing: border-box;
        }
        .form-group textarea {
          min-height: 100px;
          resize: vertical;
        }
        .btn {
          padding: 0.75rem 1rem;
          border-radius: 4px;
          border: none;
          cursor: pointer;
          font-weight: 600;
          transition: background 0.2s;
        }
        .btn-primary {
          background: #0070f3;
          color: white;
          width: 100%;
        }
        .btn-primary:hover {
          background: #0051bb;
        }
        .btn-secondary {
          background: #eee;
          color: #333;
        }
        .btn-secondary:hover {
          background: #ddd;
        }
        .agent-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .empty-state {
          color: #666;
          font-style: italic;
          text-align: center;
          padding: 3rem;
          background: #fafafa;
          border: 1px dashed #ccc;
          border-radius: 8px;
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

function AgentCard({ agent, logs, onStart, onCancel }: {
  agent: Agent
  logs: string[]
  onStart: () => void
  onCancel: () => void
}) {
  const [showLogs, setShowLogs] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const statusColor = STATUS_COLORS[agent.status] ?? '#6b7280'

  // Auto-scroll to bottom whenever new logs arrive (only if panel is visible)
  useEffect(() => {
    if (showLogs) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, showLogs])

  // Auto-open log panel when agent starts running
  useEffect(() => {
    if (agent.status === 'running') setShowLogs(true)
  }, [agent.status])

  return (
    <div className="agent-card">
      <div className="agent-header">
        <div className="agent-header-left">
          <span className="status-dot" style={{ background: statusColor }} />
          <span className="status-text" style={{ color: statusColor }}>{agent.status}</span>
          <span className="agent-id">{agent.id.slice(0, 8)}</span>
          <span className="runner-badge">{agent.runner}</span>
        </div>
        <div className="actions">
          <button
            onClick={() => setShowLogs(v => !v)}
            className="btn-small btn-secondary"
          >
            {showLogs ? 'Hide Logs' : 'Show Logs'}
            {logs.length > 0 && <span className="log-count">{logs.length}</span>}
          </button>
          {agent.status === 'pending' && (
            <button onClick={onStart} className="btn-small btn-start">Start</button>
          )}
          {agent.status === 'running' && (
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

        {showLogs && (
          <div className="logs-container">
            <div className="logs-header">
              <span>Live Logs</span>
              {agent.status === 'running' && (
                <span className="live-badge">● LIVE</span>
              )}
            </div>
            <pre className="logs">
              {logs.length > 0
                ? logs.join('')
                : agent.status === 'running'
                  ? 'Waiting for output...'
                  : 'No logs.'}
              <div ref={logsEndRef} />
            </pre>
          </div>
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
        .logs-container {
          margin-top: 1rem;
          border-top: 1px solid #f3f4f6;
          padding-top: 0.75rem;
        }
        .logs-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.4rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .live-badge {
          color: #ef4444;
          font-size: 0.7rem;
          font-weight: 700;
          animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .logs {
          background: #0d1117;
          color: #e6edf3;
          padding: 0.875rem 1rem;
          border-radius: 6px;
          font-size: 0.72rem;
          line-height: 1.6;
          max-height: 340px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-word;
          font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
          margin: 0;
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
        .log-count {
          background: #374151;
          color: #d1d5db;
          border-radius: 10px;
          padding: 0.1rem 0.4rem;
          font-size: 0.65rem;
        }
        .btn-start { background: #10b981; color: white; }
        .btn-cancel { background: #ef4444; color: white; }
        .btn-secondary { background: #f3f4f6; color: #374151; }
      `}</style>
    </div>
  )
}
