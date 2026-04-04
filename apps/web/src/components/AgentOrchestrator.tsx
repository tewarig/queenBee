'use client'

import { useState } from 'react'
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

function AgentCard({ agent, logs, onStart, onCancel }: { agent: Agent, logs: string[], onStart: () => void, onCancel: () => void }) {
  const [showLogs, setShowLogs] = useState(false)
  const statusColors = {
    pending: '#666',
    running: '#0070f3',
    completed: '#10b981',
    standby: '#10b981',
    failed: '#ef4444',
    cancelled: '#f59e0b',
  }

  const statusColor = statusColors[agent.status] || '#666'

  return (
    <div className="agent-card">
      <div className="agent-header">
        <div>
          <span className="status-badge" style={{ backgroundColor: statusColor }}>
            {agent.status}
          </span>
          <span className="agent-id">{agent.id.slice(0, 8)}</span>
          <span className="runner-badge">{agent.runner}</span>
        </div>
        <div className="actions">
          <button 
            onClick={() => setShowLogs(!showLogs)} 
            className="btn-small btn-secondary"
            style={{ marginRight: '0.5rem' }}
          >
            {showLogs ? 'Hide Logs' : 'Show Logs'}
          </button>
          {agent.status === 'pending' && (
            <button onClick={onStart} className="btn-small btn-start">Start</button>
          )}
          {agent.status === 'running' && (
            <button onClick={onCancel} className="btn-small btn-cancel">Cancel</button>
          )}
          {agent.status === 'standby' && (
            <button onClick={onStart} className="btn-small btn-start">Rerun</button>
          )}
        </div>
      </div>
      <div className="agent-body">
        <h3 className="task-title">{agent.task}</h3>
        <div className="meta">
          <span>Branch: <code>{agent.branch}</code></span>
          <span>Model: <code>{agent.model}</code></span>
          {agent.summary && (
            <div className="summary">
              <strong>Summary:</strong> {agent.summary}
            </div>
          )}
          {agent.error && (
            <div className="error">
              <strong>Error:</strong> {agent.error}
            </div>
          )}
        </div>

        {showLogs && (
          <div className="logs-container">
            <h4>Live Logs</h4>
            <pre className="logs">
              {logs.length > 0 ? logs.join('\n') : 'No logs yet...'}
            </pre>
          </div>
        )}
      </div>

      <style jsx>{`
        .agent-card {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 1.25rem;
          background: white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .agent-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: bold;
          color: white;
          text-transform: uppercase;
          margin-right: 0.75rem;
        }
        .runner-badge {
          background: #eee;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          color: #666;
          font-family: monospace;
          margin-left: 0.5rem;
        }
        .agent-id {
          font-size: 0.875rem;
          color: #888;
          font-family: monospace;
        }
        .task-title {
          margin: 0 0 0.75rem 0;
          font-size: 1.1rem;
        }
        .meta {
          font-size: 0.875rem;
          color: #444;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .meta code {
          background: #f0f0f0;
          padding: 0.1rem 0.3rem;
          border-radius: 3px;
        }
        .summary {
          margin-top: 0.75rem;
          padding: 0.75rem;
          background: #f0fdf4;
          border-radius: 4px;
          border-left: 4px solid #10b981;
        }
        .error {
          margin-top: 0.75rem;
          padding: 0.75rem;
          background: #fef2f2;
          border-radius: 4px;
          border-left: 4px solid #ef4444;
        }
        .logs-container {
          margin-top: 1rem;
          border-top: 1px solid #eee;
          padding-top: 1rem;
        }
        .logs-container h4 {
          margin: 0 0 0.5rem 0;
          font-size: 0.9rem;
          color: #666;
        }
        .logs {
          background: #222;
          color: #eee;
          padding: 1rem;
          border-radius: 4px;
          font-size: 0.75rem;
          max-height: 200px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .btn-small {
          padding: 0.4rem 0.8rem;
          border-radius: 4px;
          border: none;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 600;
        }
        .btn-start {
          background: #10b981;
          color: white;
        }
        .btn-cancel {
          background: #ef4444;
          color: white;
        }
        .btn-secondary {
          background: #eee;
          color: #333;
        }
      `}</style>
    </div>
  )
}
