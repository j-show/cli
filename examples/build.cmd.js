/**
 * @fileoverview 构建命令示例 (CommonJS)
 * @description 演示如何使用 CommonJS 语法创建带插件的命令
 */

/* eslint-disable */
const { BaseCommand } = require('@jshow/cli');

/**
 * 示例：`build` 命令（CommonJS 版本）。
 * @description 演示分组、插件声明、参数校验与错误处理钩子。
 */
class BuildCommand extends BaseCommand {
  static name = 'build';
  static force = false;

  /**
   * 命令参数配置。
   * @returns {object} 命令元信息与选项定义
   */
  get args() {
    return {
      name: 'build',
      description: '构建项目 (CommonJS 版本)',
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
          !['development', 'production'].includes(String(options.mode))
        ) {
          return '构建模式必须是 development 或 production';
        }
        return null;
      }
    };
  }

  /**
   * 执行前钩子（示例）。
   * @param {object} context - 命令上下文
   * @returns {void}
   */
  async beforeExecute(context) {
    const options = context.options;
    console.log('开始构建项目 (CommonJS)...');
    console.log(`模式: ${options.mode}`);
    console.log(`输出目录: ${options.output}`);
    if (options.watch) {
      console.log('监听模式: 已启用');
    }
  }

  /**
   * 命令主体逻辑（示例）。
   * @returns {void}
   */
  async execute() {
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

  /**
   * 执行后钩子（示例）。
   * @param {object} context - 命令上下文
   * @returns {void}
   */
  async afterExecute(context) {
    if (!context.options.watch) {
      const duration = Date.now() - context.startTime;
      console.log(`构建耗时: ${duration}ms`);
    }
  }

  /**
   * 错误处理钩子（示例）。
   * @param {Error} error - 捕获到的错误
   * @param {object} context - 命令上下文
   * @returns {boolean} 是否已处理
   */
  onError(error, context) {
    console.error(`构建失败: ${error.message}`);
    return true; // 错误已处理
  }
}

module.exports = BuildCommand;
