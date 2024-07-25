/**
 * @fileoverview 简单的 Hello World 命令示例 (CommonJS)
 * @description 演示如何使用 CommonJS 语法创建一个基本的命令
 */

/* eslint-disable */
const { BaseCommand } = require('@jshow/cli');

class HelloCommand extends BaseCommand {
  static name = 'hello';
  static force = false;

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

  beforeExecute(context) {
    console.log('准备执行 hello 命令 (CommonJS)...');
  }

  execute() {
    console.log('Hello, World! (from CommonJS)');
  }

  afterExecute(context) {
    const duration = Date.now() - context.startTime;
    console.log(`命令执行完成，耗时: ${duration}ms`);
  }
}

module.exports = HelloCommand;
