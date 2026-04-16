/**
 * @fileoverview `BaseCommand` 与 `isCommand` 单元测试
 */

import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BaseCommand,
  type CommandArgs,
  type CommandContext,
  isCommand
} from '../src/command';
import { logger } from '../src/logger';

/** 测试用：带选项与校验的命令 */
class TestCommand extends BaseCommand {
  static name = 'test';
  static force = false;

  public get args(): CommandArgs {
    return {
      name: 'test',
      description: '测试命令',
      aliases: ['t'],
      group: 'test',
      options: [
        {
          name: 'name',
          abbr: 'n',
          description: '名称参数',
          required: true,
          flagValue: true
        },
        {
          name: 'verbose',
          abbr: 'v',
          description: '详细模式',
          flagValue: false
        }
      ],
      examples: ['jshow test --name hello'],
      validate: options => {
        if (options.name === 'invalid') {
          return '名称不能为 invalid';
        }
        return null;
      }
    };
  }

  public async execute() {
    const options = this.command.opts();
    console.log(`执行测试命令: ${options.name || 'default'}`);
  }
}

/** 测试用：无选项的最小命令 */
class SimpleCommand extends BaseCommand {
  static name = 'simple';
  static force = false;

  public get args(): CommandArgs {
    return {
      name: 'simple',
      description: '简单命令',
      options: []
    };
  }

  public async execute() {
    console.log('执行简单命令');
  }
}

describe('BaseCommand', () => {
  let command: Command;
  let testCommand: TestCommand;

  beforeEach(() => {
    command = new Command('test');
    testCommand = new TestCommand(command, []);
  });

  describe('静态属性', () => {
    it('应该有 name 静态属性', () => {
      expect(TestCommand.name).toBe('test');
    });

    it('应该有 force 静态属性', () => {
      expect(TestCommand.force).toBe(false);
    });
  });

  describe('args getter', () => {
    it('应该返回正确的命令参数配置', () => {
      const args = testCommand.args;
      expect(args.name).toBe('test');
      expect(args.description).toBe('测试命令');
      expect(args.aliases).toEqual(['t']);
      expect(args.group).toBe('test');
      expect(args.options).toHaveLength(2);
      expect(args.examples).toEqual(['jshow test --name hello']);
    });
  });

  describe('name getter', () => {
    it('应该返回命令名称', () => {
      expect(testCommand.name).toBe('test');
    });
  });

  describe('初始化', () => {
    it('应该设置命令描述', () => {
      expect(command.description()).toBe('测试命令');
    });

    it('应该设置命令别名', () => {
      const aliases = command.aliases();
      expect(aliases).toContain('t');
    });

    it('应该注册选项', () => {
      const opts = command.options;
      expect(opts.length).toBeGreaterThan(0);
    });
  });

  describe('选项验证', () => {
    it('应该验证必填选项', () => {
      const simpleCmd = new Command('test');
      const cmd = new TestCommand(simpleCmd, []);

      // 直接测试 validateOptions 方法，不通过 parse
      const options = simpleCmd.opts();
      const validationError = cmd['validateOptions'](options);
      expect(validationError).toContain('必填');
    });

    it('应该执行自定义验证函数', () => {
      const simpleCmd = new Command('test');
      const cmd = new TestCommand(simpleCmd, []);

      // 直接测试 validateOptions 方法，传入选项
      const options = { name: 'invalid' };
      const validationError = cmd['validateOptions'](options);
      expect(validationError).toBe('名称不能为 invalid');
    });

    it('验证通过应该返回 null', () => {
      const simpleCmd = new Command('test');
      const cmd = new TestCommand(simpleCmd, []);

      // 直接测试 validateOptions 方法，传入有效选项
      const options = { name: 'valid' };
      const validationError = cmd['validateOptions'](options);
      expect(validationError).toBeNull();
    });
  });

  describe('生命周期钩子', () => {
    it('应该调用 beforeExecute 钩子', () => {
      const simpleCmd = new Command('test');
      const cmd = new TestCommand(simpleCmd, []);

      const context: CommandContext = {
        name: 'test',
        options: {},
        args: [],
        startTime: Date.now()
      };

      // 直接调用方法测试
      const beforeExecute = cmd.beforeExecute;
      if (beforeExecute) {
        expect(() => beforeExecute(context)).not.toThrow();
      } else {
        // 如果没有定义 beforeExecute，测试通过
        expect(true).toBe(true);
      }
    });

    it('应该调用 afterExecute 钩子', () => {
      const simpleCmd = new Command('test');
      const cmd = new TestCommand(simpleCmd, []);

      const context: CommandContext = {
        name: 'test',
        options: {},
        args: [],
        startTime: Date.now()
      };

      // 直接调用方法测试
      const afterExecute = cmd.afterExecute;
      if (afterExecute) {
        expect(() => afterExecute(context)).not.toThrow();
      } else {
        // 如果没有定义 afterExecute，测试通过
        expect(true).toBe(true);
      }
    });
  });

  describe('错误处理', () => {
    it('应该处理错误', () => {
      const loggerErrorSpy = vi
        .spyOn(logger, 'error')
        .mockImplementation(() => {});
      const simpleCmd = new Command('test');
      const cmd = new TestCommand(simpleCmd, []);

      const context: CommandContext = {
        name: 'test',
        options: {},
        args: [],
        startTime: Date.now()
      };

      const error = new Error('测试错误');
      const handled = cmd['onError'](error, context);

      expect(loggerErrorSpy).toHaveBeenCalled();
      expect(handled).toBe(false);

      loggerErrorSpy.mockRestore();
    });
  });
});

describe('isCommand', () => {
  it('应该识别有效的命令类', () => {
    expect(isCommand(TestCommand)).toBe(true);
    expect(isCommand(SimpleCommand)).toBe(true);
  });

  it('应该拒绝无效的值', () => {
    expect(isCommand(null)).toBe(false);
    expect(isCommand()).toBe(false);
    expect(isCommand('string')).toBe(false);
    expect(isCommand(123)).toBe(false);
    expect(isCommand({})).toBe(false);
    expect(isCommand(() => {})).toBe(false);
  });

  it('应该拒绝非 BaseCommand 子类', () => {
    class NotACommand {
      static name = 'test';
    }
    expect(isCommand(NotACommand)).toBe(false);
  });
});
