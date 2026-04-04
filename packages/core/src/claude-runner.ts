import { spawn, ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createInterface } from 'node:readline'

export interface RunOptions {
  task: string
  cwd: string
  model?: string
  maxBudgetUsd?: number
  appendSystemPrompt?: string
}

export interface RunResult {
  summary: string
  costUsd?: number
  exitCode: number
}

// Shape of events emitted by `claude --output-format stream-json`
interface ClaudeStreamEvent {
  type: string
  subtype?: string
  result?: string
  total_cost_usd?: number
  message?: {
    content?: Array<{ type: string; text?: string }>
  }
}

export class ClaudeRunner extends EventEmitter {
  private process?: ChildProcess

  /**
   * Run a task using `claude --print` in the given directory.
   * Emits: 'log' (string), 'done' (RunResult), 'error' (Error)
   */
  start(options: RunOptions): void {
    const args = [
      '--print',
      '--verbose',
      '--output-format', 'stream-json',
      '--model', options.model ?? 'sonnet',
    ]

    if (options.maxBudgetUsd !== undefined) {
      args.push('--max-budget-usd', String(options.maxBudgetUsd))
    }

    if (options.appendSystemPrompt) {
      args.push('--append-system-prompt', options.appendSystemPrompt)
    }

    // Task is the final positional argument
    args.push(options.task)

    this.process = spawn('claude', args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const rl = createInterface({ input: this.process.stdout! })

    let lastResult: RunResult = { summary: '', exitCode: 0 }

    rl.on('line', (line) => {
      if (!line.trim()) return

      try {
        const event: ClaudeStreamEvent = JSON.parse(line)
        this.handleStreamEvent(event, lastResult)
      } catch {
        // Plain text line — forward as log
        this.emit('log', line)
      }
    })

    // Forward stderr as logs
    const errRl = createInterface({ input: this.process.stderr! })
    errRl.on('line', (line) => {
      if (line.trim()) this.emit('log', line)
    })

    this.process.on('close', (code) => {
      const exitCode = code ?? 0
      lastResult.exitCode = exitCode
      if (exitCode === 0) {
        this.emit('done', lastResult)
      } else {
        this.emit('error', new Error(`claude exited with code ${exitCode}`))
      }
    })

    this.process.on('error', (err) => {
      this.emit('error', err)
    })
  }

  private handleStreamEvent(event: ClaudeStreamEvent, result: RunResult): void {
    if (event.type === 'result') {
      // Final result event — extract summary and cost
      result.summary = event.result ?? ''
      result.costUsd = event.total_cost_usd
      return
    }

    if (event.type === 'assistant' && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === 'text' && block.text) {
          this.emit('log', block.text)
        }
      }
    }
  }

  abort(): void {
    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = undefined
    }
  }
}
