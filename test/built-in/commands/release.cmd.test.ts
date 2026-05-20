/* eslint-disable @typescript-eslint/consistent-type-imports */
/**
 * @fileoverview 内置命令 `release` 契约测试
 * @description 对齐 `release.cmd.ts`：multi 与 monorepo 可同次执行；`--check` 策略分支不同。
 */

import type { Stats } from 'node:fs';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReleaseCommand } from '../../../src/built-in/commands/release.cmd';
import type { PackageJson } from '../../../src/utils';
import * as utils from '../../../src/utils';

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
    commitGit: vi.fn(),
    pushGit: vi.fn(),
    resetGit: vi.fn()
  };
});

function multiPkg(overrides: {
  dir: string;
  name: string;
  manifest: { name: string; private?: boolean; version: string };
}) {
  return {
    dir: overrides.dir,
    name: overrides.name,
    manifest: overrides.manifest,
    children: [] as never[]
  };
}

const defaultOptions = {
  check: false,
  force: false,
  push: false
} as const;

describe('ReleaseCommand', () => {
  let release: ReleaseCommand;

  beforeEach(async () => {
    release = new ReleaseCommand(new Command('release'), []);
    const { default: inquirer } = await import('inquirer');
    vi.mocked(inquirer.prompt).mockResolvedValue({ selecteds: ['pkg-one'] });
    vi.mocked(utils.getGroupPackages).mockReturnValue([
      multiPkg({
        dir: path.join(process.cwd(), 'packages/one'),
        name: 'pkg-one',
        manifest: { name: 'pkg-one', private: false, version: '1.0.0' }
      })
    ]);
    vi.mocked(utils.getUnCommittedFiles).mockReturnValue(['package.json']);
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
    vi.mocked(utils.addGit).mockImplementation(() => {});
    vi.mocked(utils.commitGit).mockImplementation(() => {});
    vi.mocked(utils.pushGit).mockImplementation(() => {});
    vi.mocked(utils.resetGit).mockImplementation(() => {});
  });

  afterEach(() => vi.clearAllMocks());

  describe('CLI 声明', () => {
    it('static key 应为 release', () => {
      expect(ReleaseCommand.key).toBe('release');
    });

    it('args 应包含 input 与 check/type/force/push', () => {
      const { args } = release;
      expect(args.name).toBe('release');
      expect(args.group).toBe('devOps');
      expect(args.arguments?.[0]?.name).toBe('input');
      expect(args.options?.map(o => o.name)).toEqual([
        'check',
        'type',
        'force',
        'push'
      ]);
      expect(args.options?.find(o => o.name === 'check')?.defaultValue).toBe(
        true
      );
      expect(args.options?.find(o => o.name === 'push')?.defaultValue).toBe(
        true
      );
    });
  });

  describe('中止路径', () => {
    it('monorepo 根不干净且 check=true 时不应写 manifest', async () => {
      vi.mocked(utils.getGroupPackages).mockReturnValue([
        {
          dir: '/repo/root',
          name: 'mono-root',
          manifest: { name: 'mono-root', version: '1.0.0', private: true },
          children: [
            multiPkg({
              dir: '/repo/packages/one',
              name: 'pkg-one',
              manifest: { name: 'pkg-one', private: false, version: '1.0.0' }
            })
          ]
        }
      ]);
      vi.mocked(utils.getUnCommittedFiles).mockReturnValue(['M  foo.ts']);

      await release.execute({
        name: 'release',
        args: ['.'],
        options: { ...defaultOptions, check: true },
        startTime: Date.now()
      });

      expect(utils.writeJsonSync).not.toHaveBeenCalled();
    });

    it('用户未勾选任何包时不应写 manifest', async () => {
      const { default: inquirer } = await import('inquirer');
      vi.mocked(inquirer.prompt).mockResolvedValue({ selecteds: [] });

      await release.execute({
        name: 'release',
        args: ['.'],
        options: defaultOptions,
        startTime: Date.now()
      });

      expect(utils.writeJsonSync).not.toHaveBeenCalled();
    });

    it('全部为 private 子包时不应写 manifest', async () => {
      vi.mocked(utils.getGroupPackages).mockReturnValue([
        multiPkg({
          dir: '/repo/p',
          name: 'pkg-one',
          manifest: { name: 'pkg-one', private: true, version: '1.0.0' }
        })
      ]);

      await release.execute({
        name: 'release',
        args: ['.'],
        options: { ...defaultOptions, force: true },
        startTime: Date.now()
      });

      expect(utils.writeJsonSync).not.toHaveBeenCalled();
    });

    it('multi + check + 用户 abort 时不应写 manifest', async () => {
      vi.mocked(utils.getUnCommittedFiles).mockReturnValue(['M  x.ts']);
      const { default: inquirer } = await import('inquirer');
      vi.mocked(inquirer.prompt).mockResolvedValueOnce({ select: 'abort' });

      await release.execute({
        name: 'release',
        args: ['.'],
        options: { ...defaultOptions, check: true },
        startTime: Date.now()
      });

      expect(utils.writeJsonSync).not.toHaveBeenCalled();
    });
  });

  describe('发版写回', () => {
    it('force + type=patch 时应 bump 并写回 package.json', async () => {
      await release.execute({
        name: 'release',
        args: ['.'],
        options: { ...defaultOptions, force: true, type: 'patch' },
        startTime: Date.now()
      });

      expect(utils.writeJsonSync).toHaveBeenCalled();
      const written = vi.mocked(utils.writeJsonSync).mock
        .calls[0][1] as PackageJson;
      expect(written.version).toBe('1.0.1');
    });

    it('多包时应联动依赖版本并保留 workspace:', async () => {
      const { default: inquirer } = await import('inquirer');
      vi.mocked(inquirer.prompt).mockResolvedValue({
        selecteds: ['pkg-a', 'pkg-b']
      });
      vi.mocked(utils.getGroupPackages).mockReturnValue([
        multiPkg({
          dir: '/repo/packages/a',
          name: 'pkg-a',
          manifest: { name: 'pkg-a', private: false, version: '1.0.0' }
        }),
        multiPkg({
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
        options: { ...defaultOptions, force: true, type: 'patch' },
        startTime: Date.now()
      });

      const pkgAWrite = vi
        .mocked(utils.writeJsonSync)
        .mock.calls.find(c =>
          /[\\/]packages[\\/]a[\\/]package\.json$/.test(String(c[0]))
        );
      const json = (pkgAWrite?.[1] ?? {}) as PackageJson;
      expect(json.dependencies?.['pkg-b']).toBe('1.0.1');
      expect(json.dependencies?.['pkg-c']).toBe('workspace:^');
    });

    it('有未提交变更时应 install、commit；push=true 时应 push', async () => {
      await release.execute({
        name: 'release',
        args: ['.'],
        options: { ...defaultOptions, force: true, type: 'patch', push: true },
        startTime: Date.now()
      });

      expect(utils.installPnpm).toHaveBeenCalled();
      expect(utils.addGit).toHaveBeenCalled();
      expect(utils.commitGit).toHaveBeenCalled();
      expect(utils.pushGit).toHaveBeenCalled();
    });

    it('无未提交变更时不应 commit', async () => {
      vi.mocked(utils.getUnCommittedFiles).mockReturnValue([]);

      await release.execute({
        name: 'release',
        args: ['.'],
        options: { ...defaultOptions, force: true, type: 'patch' },
        startTime: Date.now()
      });

      expect(utils.writeJsonSync).toHaveBeenCalled();
      expect(utils.commitGit).not.toHaveBeenCalled();
    });
  });
});
