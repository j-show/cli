/**
 * @fileoverview 日志插件示例
 * @description 演示如何创建一个插件，用于记录命令执行日志
 */

import { BasePlugin, type CommandContext } from '@jshow/cli';

export default class LoggerPlugin extends BasePlugin {
  static name = 'logger';
  static force = false;

  /**
   * 设置插件优先级
   * 数字越小优先级越高，越先执行
   */
  public get priority(): number {
    return 50;
  }

  /**
   * 命令执行前钩子
   */
  public beforeExecute(context: CommandContext): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [Logger] 开始执行命令: ${context.name}`);
    console.log(
      `[${timestamp}] [Logger] 参数:`,
      JSON.stringify(context.options, null, 2)
    );
  }

  /**
   * 命令执行后钩子
   */
  public afterExecute(context: CommandContext): void {
    const timestamp = new Date().toISOString();
    const duration = Date.now() - context.startTime;
    console.log(`[${timestamp}] [Logger] 命令执行完成: ${context.name}`);
    console.log(`[${timestamp}] [Logger] 执行耗时: ${duration}ms`);
  }
}
