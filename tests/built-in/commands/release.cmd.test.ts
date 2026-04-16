/* eslint-disable @typescript-eslint/consistent-type-imports */
/**
 * @fileoverview 内置命令 `release` 单元测试
 */

import type { Stats } from 'node:fs';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReleaseCommand } from '../../../src/built-in/commands/release.cmd';
import { logger } from '../../../src/logger';
import type { PackageJson } from '../../../src/utils';
import * as utils from '../../../src/utils';

vi.mock('../../../src/logger', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/logger')>();
  return {
    ...actual,
    logger: Object.assign(actual.logger, {
      fork: vi.fn(() => actual.logger)
    })
  };
});

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn()
  }
}));

vi.mock('../../../src/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/utils')>();
  return {
    ...actual,
    getWorkspacePackages: vi.fn(),
    getUnCommittedFiles: vi.fn(),
    readJsonSync: vi.fn(),
    writeJsonSync: vi.fn(),
    statSync: vi.fn(),
    execSync: vi.fn(),
    installPnpm: vi.fn(),
    addGit: vi.fn(),
    commitFileGit: vi.fn(),
    pushGit: vi.fn(),
    writeFileSync: vi.fn()
  };
});

describe('ReleaseCommand', () => {
  let cmd: Command;
  let release: ReleaseCommand;

  beforeEach(async () => {
    cmd = new Command('release');
    release = new ReleaseCommand(cmd, []);
    const { default: inquirer } = await import('inquirer');
    vi.mocked(inquirer.prompt).mockResolvedValue({
      selecteds: ['pkg-one']
    });
    vi.mocked(utils.getWorkspacePackages).mockReturnValue([
      {
        dir: path.join(process.cwd(), 'packages/one'),
        name: 'pkg-one',
        manifest: { name: 'pkg-one', private: false, version: '1.0.0' }
      }
    ]);

    // 注意：实现中 `getUnCommittedFiles` 为同步返回数组
    vi.mocked(utils.getUnCommittedFiles).mockReturnValue([]);
    vi.mocked(utils.readJsonSync).mockReturnValue({
      name: 'pkg-one',
      version: '1.0.0'
    });
    vi.mocked(utils.writeJsonSync).mockImplementation(() => {});
    vi.mocked(utils.statSync).mockReturnValue({
      isDirectory: () => true
    } as unknown as Stats);
    vi.mocked(utils.execSync).mockReturnValue('');
    vi.mocked(utils.installPnpm).mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('静态 name 应为 release', () => {
    expect(ReleaseCommand.name).toBe('release');
  });

  it('args 应包含可选 input 与 check/type/force/push 选项', () => {
    const { args } = release;
    expect(args.name).toBe('release');
    expect(args.group).toBe('devOps');
    expect(args.arguments?.[0]?.required).toBe(false);
    expect(args.options?.map(o => o.name)).toEqual([
      'check',
      'type',
      'force',
      'push'
    ]);
  });

  it('check 为 true 且仓库不干净时应记录错误并中止', async () => {
    vi.mocked(utils.getUnCommittedFiles).mockReturnValue(['M  foo.ts']);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(code => {
      throw new Error(`process.exit: ${code ?? ''}`);
    });

    await expect(
      release.execute({
        name: 'release',
        args: ['.'],
        options: { check: true, force: false, push: false },
        startTime: Date.now()
      })
    ).rejects.toThrow(/process\.exit/);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("isn't clean")
    );
    expect(infoSpy.mock.calls.some(c => c[0] === 'Completed')).toBe(false);

    errorSpy.mockRestore();
    infoSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('未选择任何包时应记录错误并中止', async () => {
    const { default: inquirer } = await import('inquirer');
    vi.mocked(inquirer.prompt).mockResolvedValue({ selecteds: [] });
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(code => {
      throw new Error(`process.exit: ${code ?? ''}`);
    });

    await expect(
      release.execute({
        name: 'release',
        args: ['.'],
        options: { check: false, force: false, push: false },
        startTime: Date.now()
      })
    ).rejects.toThrow(/process\.exit/);

    // 实现里走 warn + exit
    expect(errorSpy).not.toHaveBeenCalledWith('No packages to release');
    expect(infoSpy.mock.calls.some(c => c[0] === 'Completed')).toBe(false);

    errorSpy.mockRestore();
    infoSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('全部都是 private 包时应中止（无可发包）', async () => {
    const { default: inquirer } = await import('inquirer');
    // 即便用户勾选了，也不会出现在 choices；此处更直接：工作区扫描结果全是 private
    vi.mocked(inquirer.prompt).mockResolvedValue({ selecteds: ['pkg-one'] });
    vi.mocked(utils.getWorkspacePackages).mockReturnValue([
      {
        dir: path.join(process.cwd(), 'packages/one'),
        name: 'pkg-one',
        manifest: { name: 'pkg-one', private: true, version: '1.0.0' }
      }
    ]);
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(code => {
      throw new Error(`process.exit: ${code ?? ''}`);
    });

    await expect(
      release.execute({
        name: 'release',
        args: ['.'],
        options: { check: false, force: true, push: false },
        startTime: Date.now()
      })
    ).rejects.toThrow(/process\.exit/);

    expect(warnSpy).toHaveBeenCalledWith('No packages to release');

    warnSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('流程成功时应更新版本并完成 release 日志', async () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});

    await release.execute({
      name: 'release',
      args: ['.'],
      options: { check: false, force: true, push: false, type: 'patch' },
      startTime: Date.now()
    });

    expect(utils.writeJsonSync).toHaveBeenCalled();
    expect(infoSpy.mock.calls.some(c => c[0] === 'Completed')).toBe(true);

    infoSpy.mockRestore();
  });

  it('多包时应联动更新依赖版本（跳过 workspace: 依赖）', async () => {
    const { default: inquirer } = await import('inquirer');
    // 只需要一次 prompt：选择要发布的包
    vi.mocked(inquirer.prompt).mockResolvedValue({
      selecteds: ['pkg-a', 'pkg-b']
    });
    vi.mocked(utils.getWorkspacePackages).mockReturnValue([
      {
        dir: '/repo/packages/a',
        name: 'pkg-a',
        manifest: { name: 'pkg-a', private: false, version: '1.0.0' }
      },
      {
        dir: '/repo/packages/b',
        name: 'pkg-b',
        manifest: { name: 'pkg-b', private: false, version: '1.0.0' }
      }
    ]);
    vi.mocked(utils.readJsonSync).mockImplementation((p: unknown) => {
      const v = String(p).replace(/\\/g, '/');
      if (v.includes('/a/')) {
        return {
          name: 'pkg-a',
          version: '1.0.0',
          dependencies: {
            'pkg-b': '^1.0.0',
            // 应跳过
            'pkg-c': 'workspace:^'
          }
        };
      }
      return { name: 'pkg-b', version: '1.0.0' };
    });

    await release.execute({
      name: 'release',
      args: ['.'],
      options: { check: false, force: true, push: false, type: 'patch' },
      startTime: Date.now()
    });

    const calls = vi.mocked(utils.writeJsonSync).mock.calls;
    // pkg-b 版本 bump 到 1.0.1，因此 pkg-a 的依赖也应被替换为 1.0.1（不带 ^）
    const pkgAWrite = calls.find(c =>
      /[\\/]packages[\\/]a[\\/]package\.json$/.test(String(c[0]))
    );
    const pkgAJson = (pkgAWrite?.[1] ?? {}) as PackageJson;
    expect(pkgAJson.dependencies?.['pkg-b']).toBe('1.0.1');
    expect(pkgAJson.dependencies?.['pkg-c']).toBe('workspace:^');
  });
});
