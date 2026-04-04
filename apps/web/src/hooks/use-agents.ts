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
      const data = await res.json()
      setAgents(data)
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
            agent.status = 'standby'
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
    setLogs(prev => ({ ...prev, [id]: [] })) // Clear logs on start
    await fetch(`/api/agents/${id}/start`, { method: 'POST' })
  }

  const cancelAgent = async (id: string) => {
    await fetch(`/api/agents/${id}/cancel`, { method: 'POST' })
  }

  return { agents, logs, loading, createAgent, startAgent, cancelAgent, refresh: fetchAgents }
}
