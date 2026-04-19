/* eslint-disable @typescript-eslint/consistent-type-imports */
/**
 * @fileoverview 内置命令 `backup` 单元测试
 */

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackupCommand } from '../../../src/built-in/commands/backup.cmd';
import { logger } from '../../../src/logger';
import * as utils from '../../../src/utils';

/** 与命令内 `loggerCli.fork({ namespace })` 对齐，使 spy 作用在真实调用的实例上 */
vi.mock('../../../src/logger', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/logger')>();
  return {
    ...actual,
    logger: Object.assign(actual.logger, {
      fork: vi.fn(() => actual.logger)
    })
  };
});

vi.mock('../../../src/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/utils')>();
  return {
    ...actual,
    /** 备份命令扫描包列表由 {@link getGroupPackages} 提供，而非 `getWorkspacePackages` */
    getGroupPackages: vi.fn(),
    pullCurrentBranch: vi.fn(),
    mkdirSync: vi.fn(),
    eachDirSync: vi.fn(),
    execSync: vi.fn(),
    existsSync: vi.fn(),
    toRegExp: vi.fn((v: string) => new RegExp(v))
  };
});

describe('BackupCommand', () => {
  let cmd: Command;
  let backup: BackupCommand;

  beforeEach(() => {
    cmd = new Command('backup');
    backup = new BackupCommand(cmd, []);
    vi.mocked(utils.getGroupPackages).mockReturnValue([
      {
        dir: '/ws/packages/a',
        name: '@scope/pkg-a',
        manifest: { name: '@scope/pkg-a', version: '0.0.0' },
        children: []
      }
    ]);
    // `fetchPackage` 会在没有 `.git` 时直接跳过 pull（Windows 下 path.join 会产生 `\`）
    vi.mocked(utils.existsSync).mockImplementation((p: any) => {
      const v = String(p).replace(/\\/g, '/');
      return v.endsWith('/.git');
    });
    vi.mocked(utils.eachDirSync).mockImplementation((_root, cb) => {
      (cb as (name: string) => void)('lib');
    });

    vi.spyOn(logger, 'scope').mockImplementation(
      async (_meta: any, fn: any) => {
        return await fn({
          write: vi.fn(),
          checkLevel: vi.fn(() => false),
          info: vi.fn(),
          empty: vi.fn()
        });
      }
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('静态 name 应为 backup', () => {
    expect(BackupCommand.name).toBe('backup');
  });

  it('args 应包含位置参数与 clean、filter 选项', () => {
    const { args } = backup;
    expect(args.name).toBe('backup');
    expect(args.group).toBe('devOps');
    expect(args.arguments?.map(a => a.name)).toEqual(['input', 'output']);
    expect(args.options?.map(o => o.name)).toEqual(['clean', 'filter']);
  });

  it('execute 应拉取包、创建输出目录并复制内容', async () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});

    await backup.execute({
      name: 'backup',
      args: ['/ws', '/out'],
      options: { filter: '', clean: true },
      startTime: Date.now()
    });

    expect(utils.pullCurrentBranch).toHaveBeenCalledWith(
      true,
      '/ws/packages/a',
      expect.any(Boolean)
    );
    expect(utils.mkdirSync).toHaveBeenCalled();
    // dest 为相对路径：由 `path.relative(pkgRoot, path.join(outputDir, name))` 计算
    expect(utils.execSync).toHaveBeenCalledWith(
      expect.stringMatching(/^cp -Rf \.\/lib\s+/),
      { cwd: '/ws/packages/a' }
    );
    expect(infoSpy.mock.calls.some(c => c[0] === 'Completed')).toBe(true);

    infoSpy.mockRestore();
  });

  it('filter 选项应按包名正则过滤工作区包', async () => {
    vi.mocked(utils.getGroupPackages).mockReturnValue([
      {
        dir: '/ws/p1',
        name: '@scope/keep',
        manifest: { name: '@scope/keep', version: '0.0.0' },
        children: []
      },
      {
        dir: '/ws/p2',
        name: '@scope/skip',
        manifest: { name: '@scope/skip', version: '0.0.0' },
        children: []
      }
    ]);
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});

    await backup.execute({
      name: 'backup',
      args: ['/ws', '/out'],
      options: { filter: '^@scope/keep$', clean: true },
      startTime: Date.now()
    });

    expect(utils.pullCurrentBranch).toHaveBeenCalledTimes(1);
    expect(utils.pullCurrentBranch).toHaveBeenCalledWith(
      true,
      '/ws/p1',
      expect.any(Boolean)
    );

    infoSpy.mockRestore();
  });

  it('clean 为 false 时仍应完成备份流程', async () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});

    await backup.execute({
      name: 'backup',
      args: ['/ws', '/out'],
      options: { filter: '', clean: false },
      startTime: Date.now()
    });

    expect(utils.pullCurrentBranch).toHaveBeenCalled();
    expect(infoSpy.mock.calls.some(c => c[0] === 'Completed')).toBe(true);

    infoSpy.mockRestore();
  });

  it('clean 为 false 时不应过滤 .git（仅默认过滤 node_modules）', async () => {
    vi.mocked(utils.eachDirSync).mockImplementation((_root, cb) => {
      (cb as (name: string) => void)('.git');
      (cb as (name: string) => void)('node_modules');
      (cb as (name: string) => void)('src');
    });

    await backup.execute({
      name: 'backup',
      args: ['/ws', '/out'],
      options: { filter: '', clean: false },
      startTime: Date.now()
    });

    // node_modules 应被跳过，不会触发 execSync；.git 在 clean=false 时应被复制
    const cmds = vi.mocked(utils.execSync).mock.calls.map(c => c[0]);
    expect(cmds.some(c => c.includes('./node_modules'))).toBe(false);
    expect(cmds.some(c => c.includes('./.git'))).toBe(true);
    expect(cmds.some(c => c.includes('./src'))).toBe(true);
  });
});
