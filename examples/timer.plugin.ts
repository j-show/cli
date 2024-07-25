/**
 * @fileoverview 计时器插件示例
 * @description 演示如何创建一个插件，用于统计命令执行时间
 */

import { BasePlugin, type CommandContext } from '@jshow/cli';

export default class TimerPlugin extends BasePlugin {
  static name = 'timer';
  static force = false;

  /**
   * 设置插件优先级
   * 优先级低于 logger 插件，所以会在 logger 之后执行
   */
  public get priority(): number {
    return 100;
  }

  /**
   * 命令执行前钩子
   */
  public beforeExecute(context: CommandContext): void {
    // 可以在这里记录开始时间
    // 注意：context.startTime 已经在 CommandProgram 中设置
  }

  /**
   * 命令执行后钩子
   */
  public afterExecute(context: CommandContext): void {
    const duration = Date.now() - context.startTime;
    const seconds = (duration / 1000).toFixed(2);

    if (duration > 1000) {
      console.log(`⏱️  执行时间: ${seconds} 秒`);
    } else {
      console.log(`⏱️  执行时间: ${duration} 毫秒`);
    }
  }
}
