#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import { InstanceManager } from '@queenbee/core'

const manager = new InstanceManager()
const program = new Command()

program
  .name('qb')
  .description('QueenBee — manage multiple Claude Code instances')
  .version('0.1.0')

program
  .command('spawn')
  .description('Spawn a new Claude Code instance')
  .argument('<workdir>', 'Working directory for the instance')
  .option('-n, --name <name>', 'Name for the instance')
  .action((workdir, opts) => {
    const instance = manager.spawn({ workdir, name: opts.name })
    console.log(chalk.green(`Spawned: ${instance.name} (${instance.id})`))
  })

program
  .command('start')
  .description('Start a Claude Code instance')
  .argument('<id>', 'Instance ID')
  .action((id) => {
    manager.start(id)
    console.log(chalk.green(`Started instance ${id}`))
  })

program
  .command('stop')
  .description('Stop a running instance')
  .argument('<id>', 'Instance ID')
  .action((id) => {
    manager.stop(id)
    console.log(chalk.yellow(`Stopped instance ${id}`))
  })

program
  .command('list')
  .alias('ls')
  .description('List all instances')
  .action(() => {
    const instances = manager.list()
    if (instances.length === 0) {
      console.log(chalk.gray('No instances found.'))
      return
    }
    for (const inst of instances) {
      const statusColor =
        inst.status === 'running' ? chalk.green :
        inst.status === 'error'   ? chalk.red :
        chalk.gray
      console.log(
        `${chalk.bold(inst.name)}  ${chalk.dim(inst.id)}  ${statusColor(inst.status)}  ${chalk.dim(inst.workdir)}`
      )
    }
  })

program
  .command('remove')
  .alias('rm')
  .description('Remove an instance')
  .argument('<id>', 'Instance ID')
  .action((id) => {
    manager.remove(id)
    console.log(chalk.red(`Removed instance ${id}`))
  })

program.parse()
