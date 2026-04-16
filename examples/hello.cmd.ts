/**
 * @fileoverview 简单的 Hello World 命令示例
 * @description 演示如何创建一个基本的命令
 */

import { BaseCommand, type CommandContext } from '@jshow/cli';

/**
 * 示例：最小 `hello` 命令，演示生命周期钩子。
 */
export default class HelloCommand extends BaseCommand {
  static name = 'hello';
  static force = false;

  /**
   * 命令参数配置。
   * @returns 命令元信息与示例
   */
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

  /**
   * 执行前钩子（示例）。
   * @param context - 命令上下文
   * @returns void
   */
  public beforeExecute(context: CommandContext): void {
    console.log('准备执行 hello 命令...');
  }

  /**
   * 命令主体逻辑（示例）。
   * @returns void
   */
  public execute(): void {
    console.log('Hello, World!');
  }

  /**
   * 执行后钩子（示例）。
   * @param context - 命令上下文
   * @returns void
   */
  public afterExecute(context: CommandContext): void {
    const duration = Date.now() - context.startTime;
    console.log(`命令执行完成，耗时: ${duration}ms`);
  }
}
