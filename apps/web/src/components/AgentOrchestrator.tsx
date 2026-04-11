'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAgents } from '@/hooks/use-agents'
import { useNotifications } from '@/hooks/use-notifications'
import { useSettings } from '@/hooks/use-settings'
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
  const { settings, update: updateSettings } = useSettings()
  const { notify } = useNotifications(settings)
  const { agents, logs, loading, createAgent, startAgent, cancelAgent, sendRaw, removeAgent, refresh } = useAgents(notify)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  // Close settings panel on outside click
  useEffect(() => {
    if (!showSettings) return
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSettings])

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
        {/* Gear icon + settings popover */}
        <div ref={settingsRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            className="icon-btn settings-btn"
            onClick={() => setShowSettings(v => !v)}
            aria-label="Settings"
            title="Notification settings"
            style={{ width: 38, height: 38, borderRight: '1px solid #2a2a2a', borderRadius: 0 }}
          >
            <GearIcon active={showSettings} />
          </button>

          {showSettings && (
            <div className="settings-panel">
              <div className="settings-title">Notification Audio</div>

              <label className="settings-row settings-master">
                <span className="settings-label">Enable audio</span>
                <Toggle
                  checked={settings.audioEnabled}
                  onChange={v => updateSettings({ audioEnabled: v })}
                />
              </label>

              <div className="settings-divider" />

              <div className="settings-subtitle">Play sound for</div>

              <label className={`settings-row${!settings.audioEnabled ? ' settings-disabled' : ''}`}>
                <span className="settings-label">
                  <span className="settings-dot" style={{ background: '#10b981' }} />
                  Task completed
                </span>
                <Toggle
                  checked={settings.playOnDone}
                  disabled={!settings.audioEnabled}
                  onChange={v => updateSettings({ playOnDone: v })}
                />
              </label>

              <label className={`settings-row${!settings.audioEnabled ? ' settings-disabled' : ''}`}>
                <span className="settings-label">
                  <span className="settings-dot" style={{ background: '#ef4444' }} />
                  Task failed
                </span>
                <Toggle
                  checked={settings.playOnFailed}
                  disabled={!settings.audioEnabled}
                  onChange={v => updateSettings({ playOnFailed: v })}
                />
              </label>

              <label className={`settings-row${!settings.audioEnabled ? ' settings-disabled' : ''}`}>
                <span className="settings-label">
                  <span className="settings-dot" style={{ background: '#f59e0b' }} />
                  Input needed
                </span>
                <Toggle
                  checked={settings.playOnInput}
                  disabled={!settings.audioEnabled}
                  onChange={v => updateSettings({ playOnInput: v })}
                />
              </label>
            </div>
          )}
        </div>

        <div className="tabs" role="tablist">
          {agents.map(agent => (
            <div
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
              <button
                className="tab-close"
                onClick={e => { e.stopPropagation(); removeAgent(agent.id) }}
                aria-label="Close agent"
                title="Close and remove agent"
              >
                ✕
              </button>
            </div>
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
            onClose={() => removeAgent(activeAgent.id)}
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

function AgentView({ agent, logs, onStart, onCancel, onClose, onSendRaw }: {
  agent: Agent
  logs: string[]
  onStart: () => void
  onCancel: () => void
  onClose: () => void
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

function GearIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={active ? '#3b82f6' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function Toggle({ checked, disabled, onChange }: {
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`toggle${checked ? ' toggle-on' : ''}${disabled ? ' toggle-disabled' : ''}`}
    >
      <span className="toggle-thumb" />
    </button>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

function AppStyles() {
  return (
    <style jsx global>{`
      *, *::before, *::after { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        /* Prevent the whole page bouncing/rubber-banding on iOS */
        overscroll-behavior: none;
        overflow: hidden;
      }

      /* ── Shell ── */
      .app-shell {
        display: flex;
        flex-direction: column;
        width: 100%;
        /* 100dvh accounts for the mobile browser chrome (address bar).
           100vh on iOS Safari is taller than the visible area, causing layout overflow. */
        height: 100dvh;
        background: #0d0d0d;
        color: #e2e2e2;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        overflow: hidden;
        /* Promote to GPU layer — avoids compositing jank during scroll */
        -webkit-transform: translateZ(0);
        transform: translateZ(0);
      }

      .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100dvh;
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
        overflow: visible;
        position: relative;
        z-index: 10;
      }
      .tabs {
        display: flex;
        align-items: stretch;
        overflow-x: auto;
        flex: 1;
        scrollbar-width: none;
        height: 100%;
        /* Momentum scrolling on iOS */
        -webkit-overflow-scrolling: touch;
        /* Only handle horizontal swipes, let vertical pass through */
        touch-action: pan-x;
        /* Don't let tab scroll trigger page scroll */
        overscroll-behavior-x: contain;
      }
      .tabs::-webkit-scrollbar { display: none; }

      .tab {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 10px 0 14px;
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
        user-select: none;
      }

      .tab-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border: none;
        border-radius: 3px;
        background: transparent;
        color: #4b5563;
        font-size: 0.65rem;
        cursor: pointer;
        flex-shrink: 0;
        padding: 0;
        margin-left: 2px;
        transition: background 0.1s, color 0.1s;
        line-height: 1;
      }
      .tab-close:hover { background: #ef444433; color: #ef4444; }
      .tab:hover .tab-close { color: #6b7280; }
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

      /* ── Settings panel ── */
      .settings-btn { border-radius: 0 !important; }

      .settings-panel {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        z-index: 200;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 10px;
        padding: 12px 0 8px;
        width: 230px;
        box-shadow: 0 12px 32px rgba(0,0,0,0.6);
      }

      .settings-title {
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: #4b5563;
        padding: 0 14px 8px;
      }

      .settings-subtitle {
        font-size: 0.68rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #374151;
        padding: 4px 14px 6px;
      }

      .settings-divider {
        height: 1px;
        background: #2a2a2a;
        margin: 4px 0 8px;
      }

      .settings-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 5px 14px;
        cursor: pointer;
        transition: background 0.1s;
        gap: 8px;
      }
      .settings-row:hover { background: #222; }
      .settings-master { padding-bottom: 8px; }
      .settings-disabled { opacity: 0.4; pointer-events: none; }

      .settings-label {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 0.78rem;
        color: #c0c0c0;
        user-select: none;
      }
      .settings-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      /* ── Toggle switch ── */
      .toggle {
        position: relative;
        width: 32px;
        height: 18px;
        border: none;
        border-radius: 99px;
        background: #333;
        cursor: pointer;
        flex-shrink: 0;
        padding: 0;
        transition: background 0.2s;
      }
      .toggle-on { background: #3b82f6; }
      .toggle-disabled { cursor: not-allowed; }
      .toggle-thumb {
        position: absolute;
        top: 3px;
        left: 3px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #fff;
        transition: transform 0.2s;
      }
      .toggle-on .toggle-thumb { transform: translateX(14px); }

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
        min-height: 40px;
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
      .action-close  { background: transparent; color: #6b7280; border: 1px solid #374151; }
      .action-close:hover { background: #1f2937; color: #e2e2e2; border-color: #6b7280; }

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
        /* Smooth scroll inside modal on iOS */
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
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

      /* ── Mobile (≤ 640px) ─────────────────────────────────────────────────── */
      @media (max-width: 640px) {

        /* Larger tap targets in the tab bar */
        .tab-bar { height: 44px; }
        .tab { padding: 0 8px 0 10px; min-width: 44px; }
        .tab-label { max-width: 100px; }
        .tab-add { width: 44px; }
        .icon-btn { width: 36px; height: 36px; }
        .settings-btn { width: 44px !important; height: 44px !important; }

        /* Settings panel: pin to screen width, avoid left-edge overflow */
        .settings-panel {
          width: calc(100vw - 16px);
          left: 0;
          max-height: calc(100dvh - 60px);
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
        }

        /* Info bar: wrap to two lines instead of clipping */
        .info-bar {
          height: auto;
          min-height: 44px;
          padding: 6px 12px;
          flex-wrap: wrap;
          gap: 6px;
        }
        .info-left {
          flex-wrap: wrap;
          gap: 6px;
          min-width: 0;
        }
        /* Hide branch + model on very small screens to save space */
        .info-bar .meta-item:nth-child(3),
        .info-bar .meta-item:nth-child(4) { display: none; }

        /* Action buttons: tighter on mobile */
        .action-btn { padding: 5px 10px; font-size: 0.72rem; }

        /* Task bar: smaller text, allow wrapping */
        .task-bar { padding: 6px 12px; flex-wrap: wrap; gap: 4px; }
        .task-text { font-size: 0.8rem; }
        .agent-id-label { display: none; }

        /* Banners */
        .banner { padding: 6px 12px; font-size: 0.78rem; }

        /* Modal: full-width sheet from bottom on mobile */
        .modal-overlay { align-items: flex-end; }
        .modal {
          width: 100%;
          max-width: 100%;
          border-radius: 16px 16px 0 0;
          max-height: 92dvh;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
        }
        .modal-form { padding: 16px; gap: 14px; }
        .modal-header { padding: 14px 16px; }

        /* Stack form row vertically on mobile */
        .form-row { flex-direction: column; gap: 12px; }
        .form-field-checkbox { justify-content: flex-start; padding-bottom: 0; }

        /* Modal footer: full-width buttons */
        .modal-footer { flex-direction: column-reverse; }
        .modal-footer .btn { width: 100%; text-align: center; }
      }

      /* ── Mobile landscape (short height, wide width) ─────────────────────── */
      @media (max-height: 500px) and (orientation: landscape) {
        .tab-bar { height: 36px; }
        .info-bar { min-height: 32px; padding: 4px 12px; }
        .task-bar { padding: 4px 12px; }
      }

      /* ── Tablet (641px – 1024px) ──────────────────────────────────────────── */
      @media (min-width: 641px) and (max-width: 1024px) {
        .tab-label { max-width: 120px; }
        .info-bar .meta-item:nth-child(4) { display: none; } /* hide model badge */
        .modal { width: 480px; }
      }
    `}</style>
  )
}
