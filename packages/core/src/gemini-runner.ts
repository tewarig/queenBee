import { spawn, ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createInterface } from 'node:readline'
import type { RunOptions } from './claude-runner.js'

export class GeminiRunner extends EventEmitter {
  private process?: ChildProcess

  /**
   * Run a task using `gemini` CLI.
   * Emits: 'log' (string), 'done' (RunResult), 'error' (Error)
   */
  start(options: RunOptions): void {
    // gemini CLI might have different flags.
    // Assuming it supports similar flow for now, or just basic execution.
    const args = [
      'run',
      '--model', options.model ?? 'gemini-2.0-flash',
    ]

    // Task is the final positional argument
    args.push(options.task)

    this.process = spawn('gemini', args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const rl = createInterface({ input: this.process.stdout! })

    rl.on('line', (line) => {
      if (!line.trim()) return
      this.emit('log', line)
    })

    const errRl = createInterface({ input: this.process.stderr! })
    errRl.on('line', (line) => {
      if (line.trim()) this.emit('log', line)
    })

    this.process.on('close', (code) => {
      const exitCode = code ?? 0
      if (exitCode === 0) {
        this.emit('done', { summary: 'Task completed by Gemini', exitCode })
      } else {
        this.emit('error', new Error(`gemini exited with code ${exitCode}`))
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
