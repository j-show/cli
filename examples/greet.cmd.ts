/**
 * @fileoverview 带选项的命令示例
 * @description 演示如何创建带参数和选项的命令
 */

import { BaseCommand, type CommandContext } from '@jshow/cli';

export default class GreetCommand extends BaseCommand {
  static name = 'greet';
  static force = false;

  public get args() {
    return {
      name: 'greet',
      description: '向指定的人打招呼',
      aliases: ['g'],
      group: 'examples',
      options: [
        {
          flag: '--name <value>',
          abbreviation: '-n',
          description: '要打招呼的人的姓名',
          defaultValue: 'World',
          required: false
        },
        {
          flag: '--formal',
          abbreviation: '-f',
          description: '使用正式的语气',
          defaultValue: false,
          required: false
        },
        {
          flag: '--times <number>',
          abbreviation: '-t',
          description: '重复打招呼的次数',
          defaultValue: 1,
          required: false
        }
      ],
      examples: [
        'jshow greet',
        'jshow greet --name "Alice"',
        'jshow greet -n "Bob" --formal',
        'jshow greet -n "Charlie" -t 3'
      ],
      validate: options => {
        if (
          options.times &&
          (typeof options.times !== 'number' || options.times < 1)
        ) {
          return '重复次数必须是大于 0 的数字';
        }
        return null;
      }
    };
  }

  public beforeExecute(context: CommandContext): void {
    console.log(`开始执行 greet 命令，参数:`, context.options);
  }

  public execute(): void {
    const options = this.command.opts();
    const name = options.name || 'World';
    const formal = options.formal || false;
    const times = options.times || 1;

    const greeting = formal ? `Good day, ${name}!` : `Hello, ${name}!`;

    for (let i = 0; i < times; i++) {
      console.log(greeting);
    }
  }

  public afterExecute(context: CommandContext): void {
    const duration = Date.now() - context.startTime;
    console.log(`命令执行完成，耗时: ${duration}ms`);
  }
}
