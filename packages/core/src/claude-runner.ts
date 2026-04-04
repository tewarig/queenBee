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
interface ContentBlock {
  type: string
  text?: string
  name?: string        // tool name for tool_use blocks
  input?: unknown      // tool input for tool_use blocks
}

interface ClaudeStreamEvent {
  type: string
  subtype?: string
  result?: string
  total_cost_usd?: number
  message?: {
    content?: ContentBlock[]
  }
  tool_use_id?: string
  content?: ContentBlock[] | string  // tool_result content
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
      '--dangerously-skip-permissions',
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
      result.summary = event.result ?? ''
      result.costUsd = event.total_cost_usd
      // Emit the final summary as a log line too
      if (event.result) this.emit('log', `\n✅ Done: ${event.result}`)
      return
    }

    if (event.type === 'assistant' && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === 'text' && block.text) {
          // Claude's written response — stream it directly
          this.emit('log', block.text)
        } else if (block.type === 'tool_use' && block.name) {
          // Claude is calling a tool — show what it's doing
          this.emit('log', this.formatToolUse(block.name, block.input))
        }
      }
    }

    // Tool results (output of bash commands, file reads, etc.)
    if (event.type === 'tool_result') {
      const content = event.content
      if (typeof content === 'string' && content.trim()) {
        this.emit('log', content)
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text?.trim()) {
            this.emit('log', block.text)
          }
        }
      }
    }
  }

  private formatToolUse(name: string, input: unknown): string {
    const inp = input as Record<string, unknown> | null | undefined
    switch (name) {
      case 'write_file':
      case 'create_file':
        return `\n📝 Writing: ${inp?.path ?? inp?.file_path ?? '?'}`
      case 'edit_file':
      case 'str_replace_editor':
        return `\n✏️  Editing: ${inp?.path ?? inp?.file_path ?? '?'}`
      case 'read_file':
        return `\n📖 Reading: ${inp?.path ?? inp?.file_path ?? '?'}`
      case 'bash':
      case 'execute_bash':
        return `\n$ ${String(inp?.command ?? inp?.cmd ?? '').slice(0, 120)}`
      case 'list_directory':
      case 'ls':
        return `\n📁 ls ${inp?.path ?? '.'}`
      case 'search_files':
      case 'grep':
        return `\n🔍 Searching: ${inp?.pattern ?? inp?.query ?? ''}`
      default:
        return `\n🔧 ${name}`
    }
  }

  abort(): void {
    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = undefined
    }
  }
}
