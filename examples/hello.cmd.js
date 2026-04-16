/**
 * @fileoverview 简单的 Hello World 命令示例 (CommonJS)
 * @description 演示如何使用 CommonJS 语法创建一个基本的命令
 */

/* eslint-disable */
const { BaseCommand } = require('@jshow/cli');

/**
 * 示例：最小 `hello` 命令（CommonJS 版本）。
 */
class HelloCommand extends BaseCommand {
  static name = 'hello';
  static force = false;

  /**
   * 命令参数配置。
   * @returns {object} 命令元信息与示例
   */
  get args() {
    return {
      name: 'hello',
      description: '输出 Hello World 消息 (CommonJS 版本)',
      aliases: ['hi', 'h'],
      group: 'examples',
      options: [],
      examples: ['jshow hello', 'jshow hi']
    };
  }

  /**
   * 执行前钩子（示例）。
   * @param {object} context - 命令上下文
   * @returns {void}
   */
  beforeExecute(context) {
    console.log('准备执行 hello 命令 (CommonJS)...');
  }

  /**
   * 命令主体逻辑（示例）。
   * @returns {void}
   */
  execute() {
    console.log('Hello, World! (from CommonJS)');
  }

  /**
   * 执行后钩子（示例）。
   * @param {object} context - 命令上下文
   * @returns {void}
   */
  afterExecute(context) {
    const duration = Date.now() - context.startTime;
    console.log(`命令执行完成，耗时: ${duration}ms`);
  }
}

module.exports = HelloCommand;
