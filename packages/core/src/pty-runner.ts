import { EventEmitter } from 'node:events'
import * as pty from 'node-pty'

export interface PtyRunOptions {
  task: string
  cwd: string
  model?: string
}

export interface RunResult {
  summary: string
  exitCode: number
}

/**
 * Interactive PTY-based Claude runner.
 *
 * Unlike ClaudeRunner (which uses --print and is one-shot), this runner
 * spawns Claude in a real pseudo-terminal so Claude can ask questions and
 * receive user input mid-task.
 *
 * Emits: 'log' (string), 'done' (RunResult), 'error' (Error)
 */
export class PtyRunner extends EventEmitter {
  private ptyProcess?: pty.IPty
  private exited = false

  start(options: PtyRunOptions): void {
    const args = [
      '--dangerously-skip-permissions',
      '--model', options.model ?? 'sonnet',
      options.task,
    ]

    this.ptyProcess = pty.spawn('claude', args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: options.cwd,
      env: { ...process.env },
    })

    this.ptyProcess.onData((data: string) => {
      this.emit('log', data)
    })

    this.ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      if (this.exited) return
      this.exited = true
      this.ptyProcess = undefined

      if (exitCode === 0) {
        this.emit('done', { summary: '', exitCode: 0 })
      } else {
        this.emit('error', new Error(`claude exited with code ${exitCode}`))
      }
    })
  }

  /**
   * Send text input to Claude (e.g. to answer a question).
   * Appends a newline so Claude receives the "Enter" key.
   */
  sendInput(text: string): void {
    if (!this.ptyProcess) return
    this.ptyProcess.write(text + '\r')
  }

  /**
   * Write raw data to the PTY as-is (no newline appended).
   * Used by the xterm.js web terminal to forward exact key sequences.
   */
  writeRaw(data: string): void {
    if (!this.ptyProcess) return
    this.ptyProcess.write(data)
  }

  abort(): void {
    if (this.ptyProcess) {
      this.exited = true
      this.ptyProcess.kill('SIGTERM')
      this.ptyProcess = undefined
    }
  }
}
