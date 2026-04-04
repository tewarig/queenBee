import { spawn, ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createInterface } from 'node:readline'
import type { RunOptions } from './claude-runner.js'

export class OpenCodeRunner extends EventEmitter {
  private process?: ChildProcess

  /**
   * Run a task using `opencode` CLI.
   */
  start(options: RunOptions): void {
    const args = [
      'run',
      '--task', options.task,
    ]

    this.process = spawn('opencode', args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const rl = createInterface({ input: this.process.stdout! })
    rl.on('line', (line) => {
      if (line.trim()) this.emit('log', line)
    })

    const errRl = createInterface({ input: this.process.stderr! })
    errRl.on('line', (line) => {
      if (line.trim()) this.emit('log', line)
    })

    this.process.on('close', (code) => {
      const exitCode = code ?? 0
      if (exitCode === 0) {
        this.emit('done', { summary: 'Task completed by Open Code', exitCode })
      } else {
        this.emit('error', new Error(`opencode exited with code ${exitCode}`))
      }
    })

    this.process.on('error', (err) => {
      this.emit('error', err)
    })
  }

  abort(): void {
    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = undefined
    }
  }
}
