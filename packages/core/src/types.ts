export type InstanceStatus = 'idle' | 'running' | 'stopped' | 'error'

export interface ClaudeInstance {
  id: string
  name: string
  workdir: string
  pid?: number
  status: InstanceStatus
  createdAt: Date
  lastActiveAt?: Date
}

export interface SpawnOptions {
  name?: string
  workdir: string
  env?: Record<string, string>
}
