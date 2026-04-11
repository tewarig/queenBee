'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Agent, AgentEvent } from '@queenbee/core'

// Strip ANSI escape codes so we can pattern-match plain text
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '').replace(/\x1B\][^\x07]*\x07/g, '')
}

// Heuristic: does this log chunk look like the agent is waiting for input?
export function looksLikeInputPrompt(raw: string): boolean {
  const text = stripAnsi(raw).trim()
  if (!text) return false
  return (
    /\[y\/n\]/i.test(text) ||
    /\(y\/n\)/i.test(text) ||
    /\(yes\/no\)/i.test(text) ||
    /\bpress enter\b/i.test(text) ||
    /\?\s*$/.test(text)
  )
}

type NotifyCallback = (type: 'done' | 'failed' | 'input', body: string) => void

export function useAgents(onNotify?: NotifyCallback) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [logs, setLogs] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)

  // Fix #3: keep onNotify in a ref so the SSE closure always calls the latest version
  // without re-creating the EventSource on every settings change.
  const onNotifyRef = useRef(onNotify)
  useEffect(() => { onNotifyRef.current = onNotify }, [onNotify])

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents')
      const data: Agent[] = await res.json()
      setAgents(data)

      const withLogs = data.filter(a => a.status === 'running' || a.status === 'completed' || a.status === 'failed')
      if (withLogs.length > 0) {
        const results = await Promise.all(
          withLogs.map(a =>
            fetch(`/api/agents/${a.id}/logs`)
              .then(r => r.json())
              .catch(() => ({ logs: [] }))
          )
        )
        setLogs(prev => {
          const next = { ...prev }
          withLogs.forEach((a, i) => {
            const buffered: string[] = results[i]?.logs ?? []
            if (buffered.length > 0) {
              next[a.id] = buffered
            }
          })
          return next
        })
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAgents()

    const eventSource = new EventSource('/api/agents/events')

    eventSource.onmessage = (e) => {
      // SSE comment lines (": ping") are discarded by the browser before reaching onmessage.
      // This guard is kept for safety in case the server switches to a data-line keepalive.
      if (e.data === ': ok' || e.data === ': ping') return
      try {
        const event: AgentEvent = JSON.parse(e.data)

        if (event.type === 'log') {
          const message = event.data.message || ''
          setLogs(prev => ({
            ...prev,
            [event.agentId]: [...(prev[event.agentId] || []), message]
          }))
          if (looksLikeInputPrompt(message)) {
            onNotifyRef.current?.('input', stripAnsi(message).trim().slice(0, 120))
          }
          return
        }

        setAgents((prev) => {
          const index = prev.findIndex((a) => a.id === event.agentId)
          if (index === -1) {
            fetchAgents()
            return prev
          }
          const updated = [...prev]
          const agent = { ...updated[index] }

          if (event.type === 'started') agent.status = 'running'
          if (event.type === 'completed') {
            agent.status = 'completed'
            agent.summary = event.data.summary
            onNotifyRef.current?.('done', agent.task.slice(0, 80))
          }
          if (event.type === 'failed') {
            agent.status = 'failed'
            agent.error = event.data.error
            onNotifyRef.current?.('failed', event.data.error?.slice(0, 80) ?? agent.task.slice(0, 80))
          }

          updated[index] = agent
          return updated
        })
      } catch (err) {
        console.error('Failed to parse event', err)
      }
    }

    return () => eventSource.close()
  }, [fetchAgents])

  // Fix #2: add Content-Type header; guard against server errors
  const createAgent = async (options: any) => {
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}))
      throw new Error(error ?? 'Failed to create agent')
    }
    const agent = await res.json()
    setAgents((prev) => [...prev, agent])
    return agent
  }

  const startAgent = async (id: string) => {
    setLogs(prev => ({ ...prev, [id]: [] }))
    await fetch(`/api/agents/${id}/start`, { method: 'POST' })
  }

  const cancelAgent = async (id: string) => {
    await fetch(`/api/agents/${id}/cancel`, { method: 'POST' })
  }

  const sendInput = async (id: string, text: string) => {
    await fetch(`/api/agents/${id}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  }

  const sendRaw = async (id: string, data: string) => {
    await fetch(`/api/agents/${id}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: data }),
    })
  }

  // Fix #1: check res.ok before removing from state
  const removeAgent = async (id: string) => {
    const res = await fetch(`/api/agents/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}))
      console.error('Failed to remove agent:', error)
      return
    }
    setAgents(prev => prev.filter(a => a.id !== id))
    setLogs(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  return { agents, logs, loading, createAgent, startAgent, cancelAgent, sendInput, sendRaw, removeAgent, refresh: fetchAgents }
}
