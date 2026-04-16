/**
 * @fileoverview 计时器插件示例
 * @description 演示如何创建一个插件，用于统计命令执行时间
 */

import { BasePlugin, type CommandContext } from '@jshow/cli';

/**
 * 示例：在 `afterExecute` 中根据耗时选择秒或毫秒输出。
 */
export default class TimerPlugin extends BasePlugin {
  static name = 'timer';
  static force = false;

  /**
   * 设置插件优先级。
   * @returns 优先级（低于 logger，因此通常后执行）
   */
  public get priority(): number {
    return 100;
  }

  /**
   * 命令执行前钩子（示例）。
   * @param context - 命令上下文
   * @returns void
   * @description
   * 这里故意留空：计时只依赖 `context.startTime`，由框架统一设置，
   * 插件无需重复记录，避免不同插件间出现“起点不一致”的误差。
   */
  public async beforeExecute(context: CommandContext) {
    //
  }

  /**
   * 命令执行后钩子（示例）。
   * @param context - 命令上下文
   * @returns void
   */
  public async afterExecute(context: CommandContext) {
    const duration = Date.now() - context.startTime;
    const seconds = (duration / 1000).toFixed(2);

    if (duration > 1000) {
      console.log(`⏱️  执行时间: ${seconds} 秒`);
    } else {
      console.log(`⏱️  执行时间: ${duration} 毫秒`);
    }
  }
}
