#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { AgentManager } from '@queenbee/core'

export const manager = new AgentManager()
export function createProgram() {
  const program = new Command()

  program
    .name('qb')
    .description('QueenBee — manage multiple Claude Code agents')
    .version('0.1.0')

  program
    .command('spawn')
    .description('Spawn a new agent for a task')
    .argument('<task>', 'The task the agent should perform')
    .option('-p, --path <path>', 'Repository path', process.cwd())
    .option('-b, --branch <branch>', 'Base branch', 'main')
    .option('-r, --runner <runner>', 'Runner to use (claude, gemini, openai, opencode)', 'claude')
    .option('-m, --model <model>', 'Model to use')
    .action(async (task, opts) => {
      const spinner = ora('Spawning agent...').start()
      try {
        const agent = await manager.create({
          task,
          repoPath: opts.path,
          baseBranch: opts.branch,
          runner: opts.runner,
          model: opts.model
        })
        spinner.succeed(chalk.green(`Agent spawned: ${agent.id.slice(0, 8)} using ${agent.runner} on branch ${agent.branch}`))
        console.log(chalk.dim(`Task: ${agent.task}`))
      } catch (err: any) {
        spinner.fail(chalk.red(`Failed to spawn agent: ${err.message}`))
      }
    })

  program
    .command('start')
    .description('Start an agent')
    .argument('<id>', 'Agent ID')
    .option('-f, --follow', 'Follow logs', false)
    .action((id, opts) => {
      try {
        if (opts.follow) {
          manager.on('event', (event) => {
            if (event.agentId === id || id === 'all') {
              if (event.type === 'log') {
                process.stdout.write(event.data.message || '')
              } else if (event.type === 'completed') {
                console.log(chalk.green(`\nAgent ${event.agentId} completed!`))
                console.log(chalk.bold('Summary:'), event.data.summary)
                process.exit(0)
              } else if (event.type === 'failed') {
                console.error(chalk.red(`\nAgent ${event.agentId} failed: ${event.data.error}`))
                process.exit(1)
              }
            }
          })
        }

        manager.start(id)
        console.log(chalk.green(`Started agent ${id}`))
        
        if (!opts.follow) {
          process.exit(0)
        }
      } catch (err: any) {
        console.error(chalk.red(`Error: ${err.message}`))
        process.exit(1)
      }
    })

  program
    .command('list')
    .alias('ls')
    .description('List all agents')
    .action(() => {
      const agents = manager.list()
      if (agents.length === 0) {
        console.log(chalk.gray('No agents found.'))
        return
      }
      
      console.log(chalk.bold.underline('\nID       STATUS      BRANCH                TASK'))
      for (const agent of agents) {
        const statusColor =
          agent.status === 'running' ? chalk.blue :
          agent.status === 'completed' || agent.status === 'standby' ? chalk.green :
          agent.status === 'failed' ? chalk.red :
          chalk.gray
        
        const id = agent.id.slice(0, 8)
        const status = agent.status.padEnd(11)
        const branch = agent.branch.padEnd(21)
        const task = agent.task.length > 40 ? agent.task.slice(0, 37) + '...' : agent.task
        
        console.log(`${id} ${statusColor(status)} ${chalk.dim(branch)} ${task}`)
      }
      console.log()
    })

  program
    .command('cancel')
    .description('Cancel a running agent')
    .argument('<id>', 'Agent ID')
    .action((id) => {
      try {
        manager.cancel(id)
        console.log(chalk.yellow(`Cancelled agent ${id}`))
      } catch (err: any) {
        console.error(chalk.red(`Error: ${err.message}`))
      }
    })

  program
    .command('remove')
    .alias('rm')
    .description('Remove an agent and its worktree')
    .argument('<id>', 'Agent ID')
    .action(async (id) => {
      const spinner = ora('Removing agent...').start()
      try {
        await manager.remove(id)
        spinner.succeed(chalk.red(`Removed agent ${id}`))
      } catch (err: any) {
        spinner.fail(chalk.red(`Error: ${err.message}`))
      }
    })

  return program
}

export const program = createProgram()

export function run(argv = process.argv) {
  if (argv[1]?.endsWith('index.js') || argv[1]?.endsWith('qb') || argv[1]?.endsWith('index.ts') || argv[1]?.endsWith('bin.js')) {
    program.parse(argv)
  }
}
