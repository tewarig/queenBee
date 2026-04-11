import { spawn, ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createInterface } from 'node:readline'
import type { RunOptions } from './claude-runner.js'

const NVM_DIR = process.env.NVM_DIR ?? `${process.env.HOME}/.nvm`
// Gemini CLI requires Node >= 20.5.0; use v22.0.0 explicitly
const NODE_22 = `${NVM_DIR}/versions/node/v22.0.0/bin/node`
// Gemini is installed under v20.0.0 — run its script with the v22 node binary
const GEMINI_BIN = `${NVM_DIR}/versions/node/v20.0.0/bin/gemini`

export class GeminiRunner extends EventEmitter {
  private process?: ChildProcess

  /**
   * Run a task using `gemini` CLI.
   * Emits: 'log' (string), 'done' (RunResult), 'error' (Error)
   */
  start(options: RunOptions): void {

    const args = [
      '--prompt', options.task,
      '--model', options.model ?? 'gemini-2.0-flash',
      '--yolo',
      '--output-format', 'stream-json',
    ]

    this.process = spawn(NODE_22, [GEMINI_BIN, ...args], {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
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
