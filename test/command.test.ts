/**
 * @fileoverview `BaseCommand` 与 `isCommand` 契约测试
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

class ValidatedCommand extends BaseCommand {
  static key = 'validated';

  public get args(): CommandArgs {
    return {
      name: 'validated',
      description: '带校验的命令',
      aliases: ['v'],
      group: 'test',
      arguments: [
        { name: 'file', description: '输入文件', required: true },
        { name: 'rest', variadic: true }
      ],
      options: [
        {
          name: 'name',
          abbr: 'n',
          description: '名称',
          required: true,
          flagValue: true
        },
        {
          name: 'verbose',
          abbr: 'V',
          description: '详细输出',
          flagValue: false
        }
      ],
      examples: ['jshow validated ./a --name x'],
      validate: options =>
        options.name === 'invalid' ? '名称不能为 invalid' : null
    };
  }

  public executeSpy = vi.fn<[CommandContext], Promise<void>>();

  public async execute(context: CommandContext): Promise<void> {
    await this.executeSpy(context);
  }
}

class HookedCommand extends BaseCommand {
  static key = 'hooked';

  public get args(): CommandArgs {
    return {
      name: 'hooked',
      plugins: ['logger-plugin'],
      options: []
    };
  }

  public beforeExecuteSpy = vi.fn();
  public afterExecuteSpy = vi.fn();

  public async beforeExecute(ctx: CommandContext): Promise<void> {
    this.beforeExecuteSpy(ctx);
  }

  public async afterExecute(ctx: CommandContext): Promise<void> {
    this.afterExecuteSpy(ctx);
  }

  public async execute(): Promise<void> {
    /* noop */
  }
}

class KeyFallbackCommand extends BaseCommand {
  static name = 'from-static-name';

  public get args(): CommandArgs {
    return { name: 'from-args-name', options: [] };
  }

  public async execute(): Promise<void> {
    /* noop */
  }
}

describe('BaseCommand', () => {
  describe('init() 与 Commander 挂载', () => {
    let commander: Command;
    let command: ValidatedCommand;

    beforeEach(() => {
      commander = new Command('validated');
      command = new ValidatedCommand(commander, []);
    });

    it('应写入描述、别名、位置参数与选项', () => {
      expect(commander.description()).toBe('带校验的命令');
      expect(commander.aliases()).toContain('v');
      expect(commander.registeredArguments.map(a => a.name())).toEqual([
        'file',
        'rest'
      ]);
      expect(commander.options.length).toBeGreaterThan(0);
    });

    it('key getter 应优先 static key', () => {
      expect(command.key).toBe('validated');
    });

    it('无 static key 时应回退 static name，再回退 args.name', () => {
      const fallback = new KeyFallbackCommand(new Command('x'), []);
      expect(fallback.key).toBe('from-static-name');
    });
  });

  describe('validateOptions()', () => {
    it('缺少必填选项时应返回中文错误', () => {
      const cmd = new ValidatedCommand(new Command('validated'), []);
      expect(cmd['validateOptions']({})).toBe('选项 name 是必填的');
    });

    it('自定义 validate 失败时应返回其错误文案', () => {
      const cmd = new ValidatedCommand(new Command('validated'), []);
      expect(cmd['validateOptions']({ name: 'invalid' })).toBe(
        '名称不能为 invalid'
      );
    });

    it('校验通过时应返回 null', () => {
      const cmd = new ValidatedCommand(new Command('validated'), []);
      expect(cmd['validateOptions']({ name: 'ok' })).toBeNull();
    });
  });

  describe('action 执行链', () => {
    it('校验通过时应调用 execute 并传入 context', async () => {
      const root = new Command();
      const sub = root.command('validated');
      const instance = new ValidatedCommand(sub, []);

      await root.parseAsync(
        ['validated', './in.txt', '--name', 'hello', '--verbose'],
        { from: 'user' }
      );

      expect(instance.executeSpy).toHaveBeenCalledOnce();
      const ctx = instance.executeSpy.mock.calls[0][0];
      expect(ctx.name).toBe('validated');
      expect(ctx.options.name).toBe('hello');
      expect(ctx.options.verbose).toBe(true);
      expect(ctx.args[0]).toBe('./in.txt');
    });

    it('校验失败时应记录错误且不再调用 execute', async () => {
      const root = new Command();
      const sub = root.command('validated');
      const instance = new ValidatedCommand(sub, []);
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

      await expect(
        root.parseAsync(['validated', './in.txt', '--name', 'invalid'], {
          from: 'user'
        })
      ).rejects.toThrow('名称不能为 invalid');

      expect(instance.executeSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('应执行命令级与已声明插件的生命周期钩子', async () => {
      const root = new Command();
      const sub = root.command('hooked');
      const pluginBefore = vi.fn();
      const pluginAfter = vi.fn();
      const instance = new HookedCommand(sub, [
        {
          key: 'logger-plugin',
          beforeExecute: pluginBefore,
          afterExecute: pluginAfter
        },
        { key: 'unused-plugin', beforeExecute: vi.fn() }
      ]);

      await root.parseAsync(['hooked'], { from: 'user' });

      expect(pluginBefore).toHaveBeenCalledOnce();
      expect(instance.beforeExecuteSpy).toHaveBeenCalledOnce();
      expect(instance.afterExecuteSpy).toHaveBeenCalledOnce();
      expect(pluginAfter).toHaveBeenCalledOnce();
    });
  });

  describe('onError()', () => {
    it('默认实现应写日志并返回 false', () => {
      const cmd = new ValidatedCommand(new Command('validated'), []);
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
      const ctx: CommandContext = {
        name: 'validated',
        options: {},
        args: [],
        startTime: Date.now()
      };

      expect(cmd['onError'](new Error('boom'), ctx)).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(
        '❌ 执行命令 "validated" 时出错:',
        'boom'
      );
      errorSpy.mockRestore();
    });
  });
});

describe('isCommand', () => {
  it('应识别 BaseCommand 子类', () => {
    expect(isCommand(ValidatedCommand)).toBe(true);
  });

  it('应拒绝 null、原始类型与普通类', () => {
    expect(isCommand(null)).toBe(false);
    expect(isCommand(void 0)).toBe(false);
    expect(isCommand('x')).toBe(false);
    expect(isCommand(class Foo {})).toBe(false);
  });
});
