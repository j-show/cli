/**
 * @fileoverview 构建命令示例
 * @description 演示如何使用命令分组和更复杂的选项
 */

import {
  BaseCommand,
  type CommandArgs,
  type CommandContext,
  type CommandOptionsType
} from '@jshow/cli';

/**
 * `build` 命令可用的选项类型。
 */
type BuildOptions = CommandOptionsType & {
  watch?: boolean;
  mode?: string;
  output?: string;
};

/**
 * 示例：`build` 命令，演示分组、多选项、`validate` 与 `onError`。
 */
export default class BuildCommand extends BaseCommand<BuildOptions> {
  static name = 'build';
  static force = false;

  /**
   * 命令参数配置。
   * @returns 命令元信息与选项定义
   */
  public get args(): CommandArgs<BuildOptions> {
    return {
      name: 'build',
      description: '构建项目',
      aliases: ['b'],
      plugins: ['logger', 'timer'],
      group: 'build',
      options: [
        {
          name: 'watch',
          abbr: 'w',
          flagValue: false,
          description: '监听文件变化并自动重新构建',
          defaultValue: false,
          required: false
        },
        {
          name: 'mode',
          abbr: 'm',
          flagValue: true,
          description: '构建模式 (development | production)',
          defaultValue: 'production',
          required: false
        },
        {
          name: 'output',
          abbr: 'o',
          flagValue: true,
          description: '输出目录',
          defaultValue: './dist',
          required: false
        }
      ],
      examples: [
        'jshow build',
        'jshow build --watch',
        'jshow build -m development -o ./output',
        'jshow b -w'
      ],
      validate: options => {
        if (
          options.mode &&
          !['development', 'production'].includes(options.mode as string)
        ) {
          return '构建模式必须是 development 或 production';
        }
        return null;
      }
    };
  }

  /**
   * 错误处理钩子（示例）。
   * @param error - 捕获到的错误
   * @param context - 命令上下文
   * @returns 是否已处理
   */
  protected onError(
    error: Error,
    context: CommandContext<BuildOptions>
  ): boolean {
    console.error(`构建失败: ${error.message}`);
    // 错误已处理
    return true;
  }

  /**
   * 执行前钩子（示例）。
   * @param context - 命令上下文
   * @returns Promise<void>
   */
  public async beforeExecute(context: CommandContext<BuildOptions>) {
    const options = context.options;
    console.log('开始构建项目...');
    console.log(`模式: ${options.mode}`);
    console.log(`输出目录: ${options.output}`);
    if (options.watch) {
      console.log('监听模式: 已启用');
    }
  }

  /**
   * 命令主体逻辑（示例）。
   * @returns Promise<void>
   */
  public async execute(context: CommandContext<BuildOptions>) {
    const options = context.options;

    // 模拟构建过程
    console.log('正在构建...');

    if (options.watch) {
      console.log('监听文件变化中...');
      // 在实际应用中，这里会启动文件监听器
    } else {
      // 模拟构建完成
      setTimeout(() => {
        console.log(`构建完成！输出目录: ${options.output}`);
      }, 100);
    }
  }

  /**
   * 执行后钩子（示例）。
   * @param context - 命令上下文
   * @returns void
   */
  public async afterExecute(context: CommandContext<BuildOptions>) {
    if (!context.options.watch) {
      const duration = Date.now() - context.startTime;
      console.log(`构建耗时: ${duration}ms`);
    }
  }
}
