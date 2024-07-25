/**
 * @fileoverview 简单的 Hello World 命令示例
 * @description 演示如何创建一个基本的命令
 */

import { BaseCommand, type CommandContext } from '@jshow/cli';

export default class HelloCommand extends BaseCommand {
  static name = 'hello';
  static force = false;

  public get args() {
    return {
      name: 'hello',
      description: '输出 Hello World 消息',
      aliases: ['hi', 'h'],
      group: 'examples',
      options: [],
      examples: ['jshow hello', 'jshow hi']
    };
  }

  public beforeExecute(context: CommandContext): void {
    console.log('准备执行 hello 命令...');
  }

  public execute(): void {
    console.log('Hello, World!');
  }

  public afterExecute(context: CommandContext): void {
    const duration = Date.now() - context.startTime;
    console.log(`命令执行完成，耗时: ${duration}ms`);
  }
}
