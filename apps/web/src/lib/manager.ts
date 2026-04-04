import { AgentManager } from '@queenbee/core'

declare global {
  var agentManager: AgentManager | undefined
}

export const manager = globalThis.agentManager ?? new AgentManager()

if (process.env.NODE_ENV !== 'production') {
  globalThis.agentManager = manager
}
