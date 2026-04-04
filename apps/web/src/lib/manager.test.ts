import { describe, it, expect, vi } from 'vitest'
import { manager } from './manager'
import { AgentManager } from '@queenbee/core'

describe('manager singleton', () => {
  it('should be an instance of AgentManager', () => {
    expect(manager).toBeInstanceOf(AgentManager)
  })

  it('should be a singleton', async () => {
    const { manager: manager2 } = await import('./manager')
    expect(manager).toBe(manager2)
  })
})
