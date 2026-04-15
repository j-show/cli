/**
 * @fileoverview 错误处理插件示例
 * @description 演示如何创建一个插件，用于统一处理命令执行错误
 */

import { BasePlugin, type CommandContext } from '@jshow/cli';

/**
 * 示例：低优先级“错误处理”主题插件。
 * 注意：BasePlugin 无专用 error 钩子；真实错误处理应在命令的 `onError` 中完成。
 * 本类演示 before/after 中的诊断式日志。
 */
export default class ErrorHandlerPlugin extends BasePlugin {
  static name = 'error-handler';
  static force = false;

  public get priority(): number {
    // 低优先级，最后执行
    return 200;
  }

  public beforeExecute(context: CommandContext): void {
    // 可以在这里设置错误处理环境
    console.log(`[ErrorHandler] 准备执行命令: ${context.name}`);
  }

  public afterExecute(context: CommandContext): void {
    const duration = Date.now() - context.startTime;
    if (duration > 5000) {
      console.warn(
        `[ErrorHandler] 警告: 命令 ${context.name} 执行时间较长 (${duration}ms)`
      );
    } else {
      console.log(`[ErrorHandler] 命令 ${context.name} 执行成功`);
    }
  }
}
