/* eslint-disable @typescript-eslint/consistent-type-imports */
/**
 * @fileoverview 内置命令 `release` 单元测试
 * @description
 * 与实现对齐：`execute` 使用 {@link getGroupPackages} + {@link separateGroupPackages}，
 * 中止路径记录日志并返回布尔状态，**不会**调用 `process.exit`。
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
    getGroupPackages: vi.fn(),
    getUnCommittedFiles: vi.fn(),
    readJsonSync: vi.fn(),
    writeJsonSync: vi.fn(),
    statSync: vi.fn(),
    execSync: vi.fn(),
    installPnpm: vi.fn(),
    addGit: vi.fn(),
    commitGitByFile: vi.fn(),
    pushGit: vi.fn(),
    writeFileSync: vi.fn(),
    resetGit: vi.fn()
  };
});

/** 单个可发布的 multi 包分组（`children` 为空才会进 multi 分支） */
function mockMultiPackageEntry(overrides: {
  dir: string;
  name: string;
  manifest: { name: string; private?: boolean; version: string };
}) {
  return {
    dir: overrides.dir,
    name: overrides.name,
    manifest: overrides.manifest,
    children: []
  };
}

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
    vi.mocked(utils.getGroupPackages).mockReturnValue([
      mockMultiPackageEntry({
        dir: path.join(process.cwd(), 'packages/one'),
        name: 'pkg-one',
        manifest: { name: 'pkg-one', private: false, version: '1.0.0' }
      })
    ]);

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
    vi.mocked(utils.commitGitByFile).mockImplementation(() => {});
    vi.mocked(utils.writeFileSync).mockImplementation(() => {});
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
    expect(args.arguments?.[0]?.required).toBeUndefined();
    expect(args.options?.map(o => o.name)).toEqual([
      'check',
      'type',
      'force',
      'push'
    ]);
  });

  it('check 为 true 且 monorepo 根不干净时应中止该段流程（table 中 status 为 false）', async () => {
    vi.mocked(utils.getGroupPackages).mockReturnValue([
      {
        dir: '/repo/root',
        name: 'mono-root',
        manifest: { name: 'mono-root', version: '1.0.0', private: true },
        children: [
          {
            dir: path.join(process.cwd(), 'packages/one'),
            name: 'pkg-one',
            manifest: { name: 'pkg-one', private: false, version: '1.0.0' }
          }
        ]
      }
    ]);
    vi.mocked(utils.getUnCommittedFiles).mockReturnValue(['M  foo.ts']);
    const tableSpy = vi.spyOn(logger, 'table').mockImplementation(() => {});

    await release.execute({
      name: 'release',
      args: ['.'],
      options: { check: true, force: false, push: false },
      startTime: Date.now()
    });

    const rows = tableSpy.mock.calls[0]?.[0] as unknown[][] | undefined;
    expect(rows?.some(r => r[0] === 'mono' && r[3] === false)).toBe(true);

    tableSpy.mockRestore();
  });

  it('未选择任何包时应中止（table 中 multi 段 status 为 false；warn 在 scope 子 logger 上）', async () => {
    const { default: inquirer } = await import('inquirer');
    vi.mocked(inquirer.prompt).mockResolvedValue({ selecteds: [] });
    const tableSpy = vi.spyOn(logger, 'table').mockImplementation(() => {});

    await release.execute({
      name: 'release',
      args: ['.'],
      options: { check: false, force: false, push: false },
      startTime: Date.now()
    });

    const rows = tableSpy.mock.calls[0]?.[0] as unknown[][] | undefined;
    expect(rows?.some(r => r[0] === 'multi' && r[3] === false)).toBe(true);

    tableSpy.mockRestore();
  });

  it('全部都是 private 包时应中止（table 中 multi 段 status 为 false）', async () => {
    vi.mocked(utils.getGroupPackages).mockReturnValue([
      mockMultiPackageEntry({
        dir: path.join(process.cwd(), 'packages/one'),
        name: 'pkg-one',
        manifest: { name: 'pkg-one', private: true, version: '1.0.0' }
      })
    ]);
    const tableSpy = vi.spyOn(logger, 'table').mockImplementation(() => {});

    await release.execute({
      name: 'release',
      args: ['.'],
      options: { check: false, force: true, push: false },
      startTime: Date.now()
    });

    const rows = tableSpy.mock.calls[0]?.[0] as unknown[][] | undefined;
    expect(rows?.some(r => r[0] === 'multi' && r[3] === false)).toBe(true);

    tableSpy.mockRestore();
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
    vi.mocked(inquirer.prompt).mockResolvedValue({
      selecteds: ['pkg-a', 'pkg-b']
    });
    vi.mocked(utils.getGroupPackages).mockReturnValue([
      mockMultiPackageEntry({
        dir: '/repo/packages/a',
        name: 'pkg-a',
        manifest: { name: 'pkg-a', private: false, version: '1.0.0' }
      }),
      mockMultiPackageEntry({
        dir: '/repo/packages/b',
        name: 'pkg-b',
        manifest: { name: 'pkg-b', private: false, version: '1.0.0' }
      })
    ]);
    vi.mocked(utils.readJsonSync).mockImplementation((p: unknown) => {
      const v = String(p).replace(/\\/g, '/');
      if (v.includes('/a/')) {
        return {
          name: 'pkg-a',
          version: '1.0.0',
          dependencies: {
            'pkg-b': '^1.0.0',
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
    const pkgAWrite = calls.find(c =>
      /[\\/]packages[\\/]a[\\/]package\.json$/.test(String(c[0]))
    );
    const pkgAJson = (pkgAWrite?.[1] ?? {}) as PackageJson;
    expect(pkgAJson.dependencies?.['pkg-b']).toBe('1.0.1');
    expect(pkgAJson.dependencies?.['pkg-c']).toBe('workspace:^');
  });

  it('multi 场景 check 且未提交、用户在交互中选择 abort 时应中止该段（table 中 status 为 false）', async () => {
    vi.mocked(utils.getUnCommittedFiles).mockReturnValue(['M  x.ts']);
    const { default: inquirer } = await import('inquirer');
    vi.mocked(inquirer.prompt).mockResolvedValueOnce({ select: 'abort' });
    const tableSpy = vi.spyOn(logger, 'table').mockImplementation(() => {});

    await release.execute({
      name: 'release',
      args: ['.'],
      options: { check: true, force: false, push: false },
      startTime: Date.now()
    });

    const rows = tableSpy.mock.calls[0]?.[0] as unknown[][] | undefined;
    expect(rows?.some(r => r[0] === 'multi' && r[3] === false)).toBe(true);

    tableSpy.mockRestore();
  });
});
