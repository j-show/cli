import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BaseCommand, type CommandArgs } from '../src/command';
import { BasePlugin } from '../src/plugin';
import { CommandProgram } from '../src/program';

// 测试用的命令类
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

  public execute(): void {
    console.log('执行测试命令');
  }
}

// 测试用的另一个命令类
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

  public execute(): void {
    console.log('执行另一个命令');
  }
}

// 测试用的插件类
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

      // 运行 run 方法以设置版本号
      const originalArgv = process.argv;
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      process.argv = ['node', 'test', '--version'];
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      try {
        CommandProgram.run();
      } catch {
        // 忽略退出
      }

      const program = CommandProgram.program;
      // 检查版本选项是否已设置
      const versionOption = program.options.find(
        opt => opt.long === '--version'
      );
      expect(versionOption).toBeDefined();

      process.argv = originalArgv;
      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });
});
