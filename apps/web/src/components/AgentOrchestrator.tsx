'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAgents } from '@/hooks/use-agents'
import { TerminalPane } from '@/components/TerminalPane'
import type { Agent } from '@queenbee/core'

const STATUS_COLORS: Record<string, string> = {
  pending:   '#6b7280',
  running:   '#3b82f6',
  completed: '#10b981',
  failed:    '#ef4444',
  cancelled: '#f59e0b',
}

// ── Main shell ─────────────────────────────────────────────────────────────────

export function AgentOrchestrator() {
  const { agents, logs, loading, createAgent, startAgent, cancelAgent, sendRaw, refresh } = useAgents()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  // Auto-select first agent; keep selection valid when agents update
  useEffect(() => {
    if (agents.length === 0) { setActiveId(null); return }
    setActiveId(prev => agents.find(a => a.id === prev) ? prev : agents[0].id)
  }, [agents])

  const activeAgent = agents.find(a => a.id === activeId) ?? null

  if (loading && agents.length === 0) {
    return (
      <div className="app-shell">
        <div className="loading">Loading agents…</div>
        <AppStyles />
      </div>
    )
  }

  return (
    <div className="app-shell">
      {/* ── Tab bar ── */}
      <div className="tab-bar">
        <div className="tabs" role="tablist">
          {agents.map(agent => (
            <button
              key={agent.id}
              role="tab"
              aria-selected={activeId === agent.id}
              className={`tab${activeId === agent.id ? ' tab-active' : ''}`}
              onClick={() => setActiveId(agent.id)}
              title={agent.task}
            >
              <span
                className="tab-dot"
                style={{ background: STATUS_COLORS[agent.status] ?? '#6b7280' }}
              />
              <span className="tab-label">
                {agent.task.length > 22 ? agent.task.slice(0, 22) + '…' : agent.task}
              </span>
              {agent.status === 'running' && <span className="tab-pulse" />}
            </button>
          ))}

          <button
            className="tab-add"
            onClick={() => setShowModal(true)}
            aria-label="Spawn new agent"
            title="Spawn new agent"
          >
            +
          </button>
        </div>

        <div className="tab-bar-right">
          <button className="icon-btn" onClick={refresh} title="Refresh">
            <RefreshIcon />
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="main-content">
        {activeAgent ? (
          <AgentView
            agent={activeAgent}
            logs={logs[activeAgent.id] || []}
            onStart={() => startAgent(activeAgent.id)}
            onCancel={() => cancelAgent(activeAgent.id)}
            onSendRaw={(data) => sendRaw(activeAgent.id, data)}
          />
        ) : (
          <div className="empty-state">
            <div className="empty-icon">🐝</div>
            <p>No agents spawned yet</p>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              + Spawn Agent
            </button>
          </div>
        )}
      </div>

      {/* ── Spawn modal ── */}
      {showModal && (
        <SpawnModal
          onClose={() => setShowModal(false)}
          onSpawn={async (params) => {
            const agent = await createAgent(params)
            if (agent?.id) setActiveId(agent.id)
            setShowModal(false)
          }}
        />
      )}

      <AppStyles />
    </div>
  )
}

// ── Agent view (full-page for the selected tab) ────────────────────────────────

function AgentView({ agent, logs, onStart, onCancel, onSendRaw }: {
  agent: Agent
  logs: string[]
  onStart: () => void
  onCancel: () => void
  onSendRaw: (data: string) => void
}) {
  const running = agent.status === 'running'
  const statusColor = STATUS_COLORS[agent.status] ?? '#6b7280'

  const handleData = useCallback((data: string) => {
    onSendRaw(data)
  }, [onSendRaw])

  return (
    <div className="agent-view">
      {/* ── Info bar ── */}
      <div className="info-bar">
        <div className="info-left">
          <span className="status-pill" style={{ background: statusColor + '22', color: statusColor }}>
            <span className="status-dot" style={{ background: statusColor }} />
            {agent.status}
          </span>
          <span className="meta-item">
            <span className="meta-label">runner</span>
            <code className="meta-value">{agent.runner}</code>
          </span>
          <span className="meta-item">
            <span className="meta-label">branch</span>
            <code className="meta-value">{agent.branch}</code>
          </span>
          <span className="meta-item">
            <span className="meta-label">model</span>
            <code className="meta-value">{agent.model}</code>
          </span>
          {agent.interactive && (
            <span className="badge badge-interactive">interactive</span>
          )}
        </div>

        <div className="info-right">
          {agent.status === 'pending' && (
            <button className="action-btn action-start" onClick={onStart}>▶ Start</button>
          )}
          {running && (
            <button className="action-btn action-cancel" onClick={onCancel}>■ Cancel</button>
          )}
          {(agent.status === 'completed' || agent.status === 'failed') && (
            <button className="action-btn action-start" onClick={onStart}>↺ Rerun</button>
          )}
        </div>
      </div>

      {/* ── Task description ── */}
      <div className="task-bar">
        <span className="task-text">{agent.task}</span>
        <span className="agent-id-label">{agent.id.slice(0, 8)}</span>
      </div>

      {/* ── Summary / error banners ── */}
      {agent.summary && (
        <div className="banner banner-success">✅ {agent.summary}</div>
      )}
      {agent.error && (
        <div className="banner banner-error">✗ {agent.error}</div>
      )}

      {/* ── Terminal ── */}
      <div className="terminal-wrap">
        <TerminalPane
          logs={logs}
          interactive={agent.interactive ?? false}
          running={running}
          onData={handleData}
        />
      </div>
    </div>
  )
}

// ── Spawn modal ────────────────────────────────────────────────────────────────

function SpawnModal({ onClose, onSpawn }: {
  onClose: () => void
  onSpawn: (params: { task: string; repoPath: string; runner: string; interactive: boolean }) => Promise<void>
}) {
  const [task, setTask] = useState('')
  const [repoPath, setRepoPath] = useState('/Users/gauravtewari/Desktop/queenBee')
  const [runner, setRunner] = useState('claude')
  const [interactive, setInteractive] = useState(true)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try { await onSpawn({ task, repoPath, runner, interactive }) }
    finally { setBusy(false) }
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header">
          <h2 id="modal-title">Spawn New Agent</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-field">
            <label htmlFor="modal-task">Task description</label>
            <textarea
              id="modal-task"
              value={task}
              onChange={e => setTask(e.target.value)}
              placeholder="Explain what the agent should do…"
              rows={4}
              required
              autoFocus
            />
          </div>

          <div className="form-field">
            <label htmlFor="modal-repo">Repo path</label>
            <input
              id="modal-repo"
              type="text"
              value={repoPath}
              onChange={e => setRepoPath(e.target.value)}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-field" style={{ flex: 1 }}>
              <label htmlFor="modal-runner">Runner</label>
              <select id="modal-runner" value={runner} onChange={e => setRunner(e.target.value)}>
                <option value="claude">Claude Code</option>
                <option value="gemini">Gemini CLI</option>
                <option value="openai">OpenAI Codex</option>
                <option value="opencode">Open Code</option>
              </select>
            </div>

            <div className="form-field form-field-checkbox">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={interactive}
                  onChange={e => setInteractive(e.target.checked)}
                />
                <span>Interactive mode</span>
              </label>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Spawning…' : '🐝 Spawn Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

function AppStyles() {
  return (
    <style jsx global>{`
      *, *::before, *::after { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; height: 100%; }

      /* ── Shell ── */
      .app-shell {
        display: flex;
        flex-direction: column;
        height: 100vh;
        background: #0d0d0d;
        color: #e2e2e2;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        overflow: hidden;
      }

      .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        color: #6b7280;
        font-size: 0.9rem;
      }

      /* ── Tab bar ── */
      .tab-bar {
        display: flex;
        align-items: center;
        background: #141414;
        border-bottom: 1px solid #2a2a2a;
        height: 38px;
        flex-shrink: 0;
        overflow: hidden;
      }
      .tabs {
        display: flex;
        align-items: stretch;
        overflow-x: auto;
        flex: 1;
        scrollbar-width: none;
        height: 100%;
      }
      .tabs::-webkit-scrollbar { display: none; }

      .tab {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 14px;
        border: none;
        border-right: 1px solid #2a2a2a;
        background: transparent;
        color: #8a8a8a;
        font-size: 0.78rem;
        font-family: inherit;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        height: 100%;
        position: relative;
        transition: background 0.1s, color 0.1s;
      }
      .tab:hover { background: #1e1e1e; color: #c0c0c0; }
      .tab-active {
        background: #1e1e1e;
        color: #ffffff;
        border-bottom: 2px solid #3b82f6;
      }
      .tab-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .tab-label { max-width: 160px; overflow: hidden; text-overflow: ellipsis; }

      /* Running pulse ring */
      .tab-pulse {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #3b82f6;
        animation: pulse-ring 1.4s ease-in-out infinite;
        flex-shrink: 0;
      }
      @keyframes pulse-ring {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%       { opacity: 0.4; transform: scale(1.5); }
      }

      .tab-add {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 38px;
        height: 100%;
        border: none;
        border-right: 1px solid #2a2a2a;
        background: transparent;
        color: #6b7280;
        font-size: 1.2rem;
        cursor: pointer;
        flex-shrink: 0;
        transition: background 0.1s, color 0.1s;
      }
      .tab-add:hover { background: #1e1e1e; color: #e2e2e2; }

      .tab-bar-right {
        display: flex;
        align-items: center;
        padding: 0 10px;
        gap: 4px;
      }
      .icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 5px;
        background: transparent;
        color: #6b7280;
        cursor: pointer;
        transition: background 0.1s, color 0.1s;
      }
      .icon-btn:hover { background: #2a2a2a; color: #e2e2e2; }

      /* ── Main content ── */
      .main-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .empty-state {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        color: #4b5563;
      }
      .empty-icon { font-size: 2.5rem; }
      .empty-state p { margin: 0; font-size: 0.95rem; color: #6b7280; }

      /* ── Agent view ── */
      .agent-view {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }

      .info-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        height: 40px;
        background: #161616;
        border-bottom: 1px solid #2a2a2a;
        flex-shrink: 0;
        gap: 12px;
        overflow: hidden;
      }
      .info-left {
        display: flex;
        align-items: center;
        gap: 10px;
        overflow: hidden;
      }
      .info-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

      .status-pill {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 2px 8px;
        border-radius: 99px;
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        flex-shrink: 0;
      }
      .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .meta-item {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.75rem;
        white-space: nowrap;
      }
      .meta-label { color: #4b5563; }
      .meta-value {
        background: #222;
        color: #9ca3af;
        padding: 1px 5px;
        border-radius: 3px;
        font-family: "SF Mono", "Fira Code", monospace;
        font-size: 0.7rem;
      }

      .badge-interactive {
        background: #1e3a5f;
        color: #60a5fa;
        padding: 1px 7px;
        border-radius: 4px;
        font-size: 0.68rem;
        font-weight: 600;
      }

      .action-btn {
        padding: 4px 12px;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-size: 0.75rem;
        font-weight: 600;
        font-family: inherit;
        transition: opacity 0.15s;
      }
      .action-btn:hover { opacity: 0.85; }
      .action-start  { background: #10b981; color: white; }
      .action-cancel { background: #ef4444; color: white; }

      /* ── Task bar ── */
      .task-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 16px;
        background: #111;
        border-bottom: 1px solid #222;
        flex-shrink: 0;
      }
      .task-text {
        font-size: 0.85rem;
        color: #d1d5db;
        line-height: 1.4;
        flex: 1;
      }
      .agent-id-label {
        font-family: "SF Mono", "Fira Code", monospace;
        font-size: 0.68rem;
        color: #374151;
        flex-shrink: 0;
        margin-left: 12px;
      }

      /* ── Banners ── */
      .banner {
        padding: 8px 16px;
        font-size: 0.82rem;
        flex-shrink: 0;
      }
      .banner-success { background: #052e16; color: #86efac; border-bottom: 1px solid #14532d; }
      .banner-error   { background: #2d0a0a; color: #fca5a5; border-bottom: 1px solid #7f1d1d; }

      /* ── Terminal ── */
      .terminal-wrap {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .terminal-wrap > * { flex: 1; }

      /* ── Buttons ── */
      .btn {
        padding: 8px 18px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 600;
        font-family: inherit;
        transition: opacity 0.15s;
      }
      .btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-primary  { background: #3b82f6; color: white; }
      .btn-primary:hover:not(:disabled) { background: #2563eb; }
      .btn-ghost    { background: transparent; color: #9ca3af; border: 1px solid #374151; }
      .btn-ghost:hover { background: #1f2937; color: #e2e2e2; }

      /* ── Modal ── */
      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
      }
      .modal {
        background: #161616;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        width: 540px;
        max-width: calc(100vw - 32px);
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
        overflow: hidden;
      }
      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #2a2a2a;
      }
      .modal-header h2 {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 600;
        color: #e2e2e2;
      }
      .modal-close {
        background: none;
        border: none;
        color: #6b7280;
        cursor: pointer;
        font-size: 0.9rem;
        padding: 4px 6px;
        border-radius: 4px;
        line-height: 1;
        transition: background 0.1s, color 0.1s;
      }
      .modal-close:hover { background: #2a2a2a; color: #e2e2e2; }

      .modal-form { padding: 20px; display: flex; flex-direction: column; gap: 16px; }

      .form-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .form-field label {
        font-size: 0.75rem;
        font-weight: 600;
        color: #9ca3af;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .form-field textarea,
      .form-field input[type="text"],
      .form-field select {
        background: #0d0d0d;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        color: #e2e2e2;
        font-family: inherit;
        font-size: 0.875rem;
        padding: 8px 10px;
        width: 100%;
        transition: border-color 0.15s;
        outline: none;
      }
      .form-field textarea:focus,
      .form-field input[type="text"]:focus,
      .form-field select:focus { border-color: #3b82f6; }
      .form-field textarea { resize: vertical; line-height: 1.5; }
      .form-field select option { background: #161616; }

      .form-row { display: flex; gap: 16px; align-items: flex-end; }
      .form-field-checkbox { justify-content: flex-end; padding-bottom: 2px; }
      .checkbox-label {
        display: flex;
        align-items: center;
        gap: 7px;
        cursor: pointer;
        font-size: 0.82rem;
        color: #9ca3af;
        white-space: nowrap;
      }
      .checkbox-label input[type="checkbox"] {
        width: 15px;
        height: 15px;
        accent-color: #3b82f6;
        cursor: pointer;
      }

      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding-top: 4px;
      }
    `}</style>
  )
}
