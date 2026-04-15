/**
 * @fileoverview `CommandProgram` 静态 API 单元测试
 */

import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BaseCommand, type CommandArgs } from '../src/command';
import { BasePlugin } from '../src/plugin';
import { CommandProgram } from '../src/program';

/** 测试用命令 */
class TestCommand extends BaseCommand {
  static name = 'test-command';
  static force = false;

  public get args(): CommandArgs {
    return {
      name: 'test-command',
      description: '测试命令',
      group: 'test',
      options: []
    };
  }

  public async execute() {
    console.log('执行测试命令');
  }
}

/** 测试用：第二个命令，用于链式 `use` */
class AnotherCommand extends BaseCommand {
  static name = 'another-command';
  static force = false;

  public get args(): CommandArgs {
    return {
      name: 'another-command',
      description: '另一个命令',
      group: 'other',
      options: []
    };
  }

  public async execute() {
    console.log('执行另一个命令');
  }
}

/** 测试用插件 */
class TestPlugin extends BasePlugin {
  static name = 'test-plugin';
  static force = false;

  public get priority(): number {
    return 50;
  }
}

describe('CommandProgram', () => {
  beforeEach(() => {
    // 清理状态 - 重置 program 和 commands
    CommandProgram.reset();
  });

  describe('version', () => {
    it('应该返回版本号', () => {
      const version = CommandProgram.version;
      expect(typeof version).toBe('string');
      expect(version).toBeTruthy();
    });
  });

  describe('program', () => {
    it('应该返回 Commander 程序实例', () => {
      const program = CommandProgram.program;
      expect(program).toBeInstanceOf(Command);
    });
  });

  describe('install', () => {
    it('应该安装插件', () => {
      expect(() => {
        CommandProgram.install(TestPlugin);
      }).not.toThrow();
    });

    it('应该拒绝重复安装同名插件（force=false）', () => {
      CommandProgram.install(TestPlugin);
      expect(() => {
        CommandProgram.install(TestPlugin, false);
      }).toThrow("Plugin 'test-plugin' already exists.");
    });

    it('应该允许强制覆盖插件（force=true）', () => {
      CommandProgram.install(TestPlugin);
      expect(() => {
        CommandProgram.install(TestPlugin, true);
      }).not.toThrow();
    });

    it('应该支持链式调用', () => {
      class Plugin1 extends BasePlugin {
        static name = 'plugin1';
      }
      class Plugin2 extends BasePlugin {
        static name = 'plugin2';
      }

      const result = CommandProgram.install(Plugin1).install(Plugin2);
      expect(result).toBe(CommandProgram);
    });
  });

  describe('use', () => {
    it('应该注册命令', () => {
      expect(() => {
        CommandProgram.use(TestCommand);
      }).not.toThrow();
    });

    it('应该拒绝重复注册同名命令（force=false）', () => {
      CommandProgram.use(TestCommand);
      expect(() => {
        CommandProgram.use(TestCommand, false);
      }).toThrow("Command 'test-command' already exists.");
    });

    it('应该允许强制覆盖命令（force=true）', () => {
      CommandProgram.use(TestCommand);
      expect(() => {
        CommandProgram.use(TestCommand, true);
      }).not.toThrow();
    });

    it('应该支持链式调用', () => {
      CommandProgram.reset();
      const result = CommandProgram.use(TestCommand).use(AnotherCommand);
      expect(result).toBe(CommandProgram);
    });
  });

  describe('run', () => {
    it('应该能够运行程序', () => {
      CommandProgram.use(TestCommand);

      // 模拟 process.argv
      const originalArgv = process.argv;
      process.argv = ['node', 'test', 'test-command'];

      // 捕获可能的错误
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      try {
        CommandProgram.run();
      } catch {
        // 忽略解析错误，因为我们只是测试 run 方法是否被调用
      }

      process.argv = originalArgv;
      consoleErrorSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('应该设置版本号', () => {
      CommandProgram.use(TestCommand);

      // `run()` 内部调用 `parseAsync` 且不 await；避免真实解析触发 `process.exit` 造成未处理的 Promise 拒绝
      const parseSpy = vi
        .spyOn(Command.prototype, 'parseAsync')
        .mockImplementation(async () => {
          return Promise.resolve(new Command());
        });

      const originalArgv = process.argv;
      process.argv = ['node', 'test', '--version'];

      try {
        CommandProgram.run();
      } finally {
        parseSpy.mockRestore();
        process.argv = originalArgv;
      }

      const program = CommandProgram.program;
      const versionOption = program.options.find(
        opt => opt.long === '--version'
      );
      expect(versionOption).toBeDefined();
    });
  });
});
