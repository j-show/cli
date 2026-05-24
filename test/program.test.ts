/**
 * @fileoverview `CommandProgram` 与 `initBuiltIn` 契约测试
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackupCommand } from '../src/built-in/commands/backup.cmd';
import { PublishCommand } from '../src/built-in/commands/publish.cmd';
import { ReleaseCommand } from '../src/built-in/commands/release.cmd';
import { UpgradeCommand } from '../src/built-in/commands/upgrade.cmd';
import { BaseCommand, type CommandArgs, isCommand } from '../src/command';
import { BasePlugin } from '../src/plugin';
import { CommandProgram, initBuiltIn } from '../src/program';

const repoPkg = JSON.parse(
  fs.readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'package.json'
    ),
    'utf-8'
  )
) as { version: string };

class EchoCommand extends BaseCommand {
  static key = 'echo-cmd';

  public get args(): CommandArgs {
    return {
      name: 'echo-cmd',
      description: 'echo',
      group: 'examples',
      options: []
    };
  }

  public async execute(): Promise<void> {
    /* noop */
  }
}

class SamplePlugin extends BasePlugin {
  static key = 'sample-plugin';
}

describe('CommandProgram', () => {
  let parseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    CommandProgram.reset();
    parseSpy = vi
      .spyOn(Command.prototype, 'parseAsync')
      .mockResolvedValue(void 0 as never);
  });

  afterEach(() => {
    parseSpy.mockRestore();
    CommandProgram.reset();
  });

  describe('version / program', () => {
    it('version 应读取仓库 package.json', () => {
      expect(CommandProgram.version).toBe(repoPkg.version);
    });

    it('program 应为 Commander 根实例且名为 jshow', () => {
      expect(CommandProgram.program).toBeInstanceOf(Command);
      expect(CommandProgram.program.name()).toBe('jshow');
    });
  });

  describe('install', () => {
    it('同名插件在 force=false 时应抛错', () => {
      CommandProgram.install(SamplePlugin);
      expect(() => CommandProgram.install(SamplePlugin)).toThrow(
        "Plugin 'sample-plugin' already exists."
      );
    });

    it('force=true 时应允许覆盖', () => {
      CommandProgram.install(SamplePlugin);
      expect(() => CommandProgram.install(SamplePlugin, true)).not.toThrow();
    });

    it('应支持链式调用', () => {
      class P1 extends BasePlugin {
        static key = 'p1';
      }
      class P2 extends BasePlugin {
        static key = 'p2';
      }
      expect(CommandProgram.install(P1).install(P2)).toBe(CommandProgram);
    });
  });

  describe('use', () => {
    it('同名命令在 force=false 时应抛错', () => {
      CommandProgram.use(EchoCommand);
      expect(() => CommandProgram.use(EchoCommand)).toThrow(
        "Command 'echo-cmd' already exists."
      );
    });

    it('force=true 时应允许覆盖', () => {
      CommandProgram.use(EchoCommand);
      expect(() => CommandProgram.use(EchoCommand, true)).not.toThrow();
    });
  });

  describe('run', () => {
    it('应挂载子命令、写入 --version、增强帮助并调用 parseAsync', async () => {
      CommandProgram.use(EchoCommand);
      await CommandProgram.run();

      const names = CommandProgram.program.commands.map(c => c.name());
      expect(names).toContain('echo-cmd');
      expect(
        CommandProgram.program.options.some(o => o.long === '--version')
      ).toBe(true);

      const help = CommandProgram.program.helpInformation();
      expect(help).toContain('Command Groups:');
      expect(help).toContain('examples');
      expect(help).toContain('echo');

      expect(parseSpy).toHaveBeenCalledWith(process.argv);
    });
  });

  describe('reset', () => {
    it('应清空已注册命令与插件', async () => {
      CommandProgram.use(EchoCommand);
      CommandProgram.install(SamplePlugin);
      CommandProgram.reset();

      expect(() => CommandProgram.use(EchoCommand)).not.toThrow();
      expect(() => CommandProgram.install(SamplePlugin)).not.toThrow();
    });
  });
});

describe('initBuiltIn', () => {
  let parseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    CommandProgram.reset();
    parseSpy = vi
      .spyOn(Command.prototype, 'parseAsync')
      .mockResolvedValue(void 0 as never);
  });

  afterEach(() => {
    parseSpy.mockRestore();
    CommandProgram.reset();
  });

  it('应注册 backup、publish、release、upgrade 内置命令', async () => {
    initBuiltIn(CommandProgram);
    await CommandProgram.run();

    const names = CommandProgram.program.commands.map(c => c.name());
    expect(names).toEqual(
      expect.arrayContaining(['backup', 'publish', 'release', 'upgrade'])
    );
    expect(isCommand(BackupCommand)).toBe(true);
    expect(isCommand(PublishCommand)).toBe(true);
    expect(isCommand(ReleaseCommand)).toBe(true);
    expect(isCommand(UpgradeCommand)).toBe(true);
  });

  it('应返回 CommandProgram 以支持链式调用', () => {
    expect(initBuiltIn(CommandProgram)).toBe(CommandProgram);
  });
});
