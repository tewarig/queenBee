'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Agent, AgentEvent } from '@queenbee/core'

export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [logs, setLogs] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents')
      const data: Agent[] = await res.json()
      setAgents(data)

      // Replay buffered logs for agents that already have output
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
      if (e.data === ': ok') return
      try {
        const event: AgentEvent = JSON.parse(e.data)

        if (event.type === 'log') {
          setLogs(prev => ({
            ...prev,
            [event.agentId]: [...(prev[event.agentId] || []), event.data.message || '']
          }))
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
          }
          if (event.type === 'failed') {
            agent.status = 'failed'
            agent.error = event.data.error
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

  const createAgent = async (options: any) => {
    const res = await fetch('/api/agents', {
      method: 'POST',
      body: JSON.stringify(options),
    })
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

  return { agents, logs, loading, createAgent, startAgent, cancelAgent, sendInput, sendRaw, refresh: fetchAgents }
}
