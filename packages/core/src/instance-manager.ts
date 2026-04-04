import { spawn, ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { ClaudeInstance, SpawnOptions, InstanceStatus } from './types.js'

export class InstanceManager {
  private instances = new Map<string, ClaudeInstance>()
  private processes = new Map<string, ChildProcess>()

  spawn(options: SpawnOptions): ClaudeInstance {
    const id = randomUUID()
    const instance: ClaudeInstance = {
      id,
      name: options.name ?? `bee-${id.slice(0, 6)}`,
      workdir: options.workdir,
      status: 'idle',
      createdAt: new Date(),
    }

    this.instances.set(id, instance)
    return instance
  }

  start(id: string): void {
    const instance = this.get(id)
    const proc = spawn('claude', [], {
      cwd: instance.workdir,
      env: { ...process.env },
      stdio: 'pipe',
    })

    instance.pid = proc.pid
    instance.status = 'running'
    instance.lastActiveAt = new Date()
    this.processes.set(id, proc)

    proc.on('exit', () => {
      instance.status = 'stopped'
      instance.pid = undefined
      this.processes.delete(id)
    })

    proc.on('error', () => {
      instance.status = 'error'
      this.processes.delete(id)
    })
  }

  stop(id: string): void {
    const proc = this.processes.get(id)
    if (proc) {
      proc.kill('SIGTERM')
    }
  }

  get(id: string): ClaudeInstance {
    const instance = this.instances.get(id)
    if (!instance) throw new Error(`Instance ${id} not found`)
    return instance
  }

  list(): ClaudeInstance[] {
    return Array.from(this.instances.values())
  }

  remove(id: string): void {
    this.stop(id)
    this.instances.delete(id)
  }
}
