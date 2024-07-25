/**
 * @fileoverview 构建命令示例
 * @description 演示如何使用命令分组和更复杂的选项
 */

import { BaseCommand, type CommandContext } from '@jshow/cli';

export default class BuildCommand extends BaseCommand {
  static name = 'build';
  static force = false;

  public get args() {
    return {
      name: 'build',
      description: '构建项目',
      aliases: ['b'],
      plugins: ['logger', 'timer'],
      group: 'build',
      options: [
        {
          flag: '--watch',
          abbreviation: '-w',
          description: '监听文件变化并自动重新构建',
          defaultValue: false,
          required: false
        },
        {
          flag: '--mode <mode>',
          abbreviation: '-m',
          description: '构建模式 (development | production)',
          defaultValue: 'production',
          required: false
        },
        {
          flag: '--output <dir>',
          abbreviation: '-o',
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

  protected onError(error: Error, context: CommandContext): boolean {
    console.error(`构建失败: ${error.message}`);
    // 错误已处理
    return true;
  }

  public beforeExecute(context: CommandContext): void {
    const options = context.options;
    console.log('开始构建项目...');
    console.log(`模式: ${options.mode}`);
    console.log(`输出目录: ${options.output}`);
    if (options.watch) {
      console.log('监听模式: 已启用');
    }
  }

  public execute(): void {
    const options = this.command.opts();

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

  public afterExecute(context: CommandContext): void {
    if (!context.options.watch) {
      const duration = Date.now() - context.startTime;
      console.log(`构建耗时: ${duration}ms`);
    }
  }
}
