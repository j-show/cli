/* eslint-disable @typescript-eslint/consistent-type-imports */
/**
 * @fileoverview 内置命令 `upgrade` 契约测试
 * @description 对齐 `upgrade.cmd.ts`：先多选依赖再查 registry；multi/mono 互斥。
 */

import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UpgradeCommand } from '../../../src/built-in/commands/upgrade.cmd';
import * as utils from '../../../src/utils';

vi.mock('../../../src/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/utils')>();
  return {
    ...actual,
    getGroupPackages: vi.fn(),
    execSync: vi.fn(),
    checkboxInquirer: vi.fn(),
    confirmInquirer: vi.fn(),
    inputInquirer: vi.fn(),
    installPnpm: vi.fn(),
    addGit: vi.fn(),
    commitGit: vi.fn(),
    getUnCommittedFiles: vi.fn(),
    pushGit: vi.fn()
  };
});

function multiPkg(overrides: {
  dir: string;
  name: string;
  manifest: {
    name: string;
    version: string;
    scope?: string;
    dependencies?: Record<string, string>;
  };
}) {
  return {
    dir: overrides.dir,
    name: overrides.name,
    manifest: overrides.manifest,
    children: [] as never[]
  };
}

const defaultOptions = {
  local: false,
  ignore: '',
  force: false,
  push: false
} as const;

describe('UpgradeCommand', () => {
  let upgrade: UpgradeCommand;

  beforeEach(() => {
    upgrade = new UpgradeCommand(new Command('upgrade'), []);
    vi.mocked(utils.getGroupPackages).mockReturnValue([]);
    vi.mocked(utils.execSync).mockReturnValue('');
    vi.mocked(utils.checkboxInquirer).mockResolvedValue([]);
    vi.mocked(utils.confirmInquirer).mockResolvedValue(false);
    vi.mocked(utils.inputInquirer).mockResolvedValue('');
    vi.mocked(utils.installPnpm).mockImplementation(() => {});
    vi.mocked(utils.addGit).mockImplementation(() => {});
    vi.mocked(utils.commitGit).mockImplementation(() => {});
    vi.mocked(utils.getUnCommittedFiles).mockReturnValue([]);
    vi.mocked(utils.pushGit).mockImplementation(() => {});
  });

  afterEach(() => vi.clearAllMocks());

  describe('CLI 声明', () => {
    it('static key 应为 upgrade', () => {
      expect(UpgradeCommand.key).toBe('upgrade');
    });

    it('args 应声明 input 与 local/ignore/force/push', () => {
      const { args } = upgrade;
      expect(args.name).toBe('upgrade');
      expect(args.group).toBe('devOps');
      expect(args.arguments?.[0]?.name).toBe('input');
      expect(args.options?.map(o => o.name)).toEqual([
        'local',
        'ignore',
        'force',
        'push'
      ]);
      expect(args.options?.find(o => o.name === 'push')?.defaultValue).toBe(
        true
      );
    });
  });

  describe('execute', () => {
    it('无工作区包时应正常结束', async () => {
      await expect(
        upgrade.execute({
          name: 'upgrade',
          args: ['.'],
          options: { ...defaultOptions },
          startTime: Date.now()
        })
      ).resolves.toBeUndefined();

      expect(utils.checkboxInquirer).not.toHaveBeenCalled();
    });

    it('multi 与 monorepo 同时存在时应 exit(1)', async () => {
      vi.mocked(utils.getGroupPackages).mockReturnValue([
        multiPkg({
          dir: '/ws/a',
          name: 'pkg-a',
          manifest: { name: 'pkg-a', version: '1.0.0', scope: '@s/' }
        }),
        {
          dir: '/repo/root',
          name: 'mono',
          manifest: {
            name: 'mono',
            version: '1.0.0',
            private: true,
            scope: '@s/'
          },
          children: [
            multiPkg({
              dir: '/repo/c',
              name: 'pkg-c',
              manifest: { name: 'pkg-c', version: '1.0.0' }
            })
          ]
        }
      ]);
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code = 1) => {
          throw new Error(`exit:${code}`);
        });

      await expect(
        upgrade.execute({
          name: 'upgrade',
          args: ['.'],
          options: { ...defaultOptions },
          startTime: Date.now()
        })
      ).rejects.toThrow('exit:1');

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(utils.execSync).not.toHaveBeenCalled();
      exitSpy.mockRestore();
    });
  });

  describe('multi 独立包', () => {
    const multiWithLodash = () =>
      multiPkg({
        dir: '/ws/p1',
        name: 'pkg-one',
        manifest: {
          name: 'pkg-one',
          version: '1.0.0',
          scope: '@org/',
          dependencies: { lodash: '^4.17.0' }
        }
      });

    it('应先多选依赖再对选中项 pnpm info', async () => {
      vi.mocked(utils.getGroupPackages).mockReturnValue([multiWithLodash()]);
      vi.mocked(utils.checkboxInquirer).mockResolvedValue(['lodash']);
      vi.mocked(utils.execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('pnpm info')) {
          return JSON.stringify({ name: 'lodash', version: '4.17.21' });
        }
        return '';
      });

      await upgrade.execute({
        name: 'upgrade',
        args: ['/ws'],
        options: { ...defaultOptions },
        startTime: Date.now()
      });

      expect(utils.getGroupPackages).toHaveBeenCalledWith(path.resolve('/ws'));
      expect(utils.checkboxInquirer).toHaveBeenCalledWith(
        'Select the packages to upgrade',
        ['lodash']
      );
      expect(utils.execSync).toHaveBeenCalledWith(
        expect.stringContaining('pnpm info --json lodash')
      );
    });

    it('用户未勾选时不应查询 registry', async () => {
      vi.mocked(utils.getGroupPackages).mockReturnValue([multiWithLodash()]);
      vi.mocked(utils.checkboxInquirer).mockResolvedValue([]);

      await upgrade.execute({
        name: 'upgrade',
        args: ['.'],
        options: { ...defaultOptions },
        startTime: Date.now()
      });

      expect(utils.checkboxInquirer).toHaveBeenCalled();
      expect(utils.execSync).not.toHaveBeenCalledWith(
        expect.stringContaining('pnpm info')
      );
    });

    it('ignore 应排除匹配的依赖名（真实 toPatterns）', async () => {
      vi.mocked(utils.getGroupPackages).mockReturnValue([
        multiPkg({
          dir: '/ws/p1',
          name: 'pkg-one',
          manifest: {
            name: 'pkg-one',
            version: '1.0.0',
            scope: '@org/',
            dependencies: {
              lodash: '^4.17.0',
              chalk: '^4.0.0'
            }
          }
        })
      ]);
      vi.mocked(utils.checkboxInquirer).mockResolvedValue(['chalk']);
      vi.mocked(utils.execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('chalk')) {
          return JSON.stringify({ name: 'chalk', version: '4.1.2' });
        }
        return '';
      });

      await upgrade.execute({
        name: 'upgrade',
        args: ['.'],
        options: { ...defaultOptions, ignore: '^lodash$' },
        startTime: Date.now()
      });

      expect(utils.checkboxInquirer).toHaveBeenCalledWith(
        'Select the packages to upgrade',
        ['chalk']
      );
      expect(utils.execSync).not.toHaveBeenCalledWith(
        expect.stringContaining('lodash')
      );
    });

    it('仅 workspace:* 依赖时不应进入多选或 registry', async () => {
      vi.mocked(utils.getGroupPackages).mockReturnValue([
        multiPkg({
          dir: '/ws/p1',
          name: 'pkg-one',
          manifest: {
            name: 'pkg-one',
            version: '1.0.0',
            scope: '@org/',
            dependencies: { '@org/internal': 'workspace:*' }
          }
        })
      ]);

      await upgrade.execute({
        name: 'upgrade',
        args: ['.'],
        options: { ...defaultOptions },
        startTime: Date.now()
      });

      expect(utils.checkboxInquirer).not.toHaveBeenCalled();
      expect(utils.execSync).not.toHaveBeenCalled();
    });
  });

  describe('monorepo', () => {
    it('应先 pnpm info 再 pnpm search scope 私有包', async () => {
      vi.mocked(utils.getGroupPackages).mockReturnValue([
        {
          dir: '/repo/root',
          name: 'mono-root',
          manifest: {
            name: 'mono-root',
            version: '1.0.0',
            private: true,
            scope: '@myorg/',
            dependencies: { 'external-pkg': '^1.0.0' }
          },
          children: [
            multiPkg({
              dir: '/repo/packages/app',
              name: '@myorg/app',
              manifest: {
                name: '@myorg/app',
                version: '1.0.0',
                dependencies: { 'external-pkg': '1.0.0' }
              }
            })
          ]
        }
      ]);
      vi.mocked(utils.checkboxInquirer).mockResolvedValue(['external-pkg']);
      const calls: string[] = [];
      vi.mocked(utils.execSync).mockImplementation((cmd: string) => {
        calls.push(cmd);
        if (cmd.includes('pnpm info')) {
          return JSON.stringify({ name: 'external-pkg', version: '1.0.1' });
        }
        if (cmd.includes('pnpm search')) {
          return '@myorg/private-pkg\t1.2.0\n';
        }
        return '';
      });

      await upgrade.execute({
        name: 'upgrade',
        args: ['.'],
        options: { ...defaultOptions },
        startTime: Date.now()
      });

      expect(calls.some(c => c.includes('pnpm info'))).toBe(true);
      expect(calls.some(c => c.includes('pnpm search'))).toBe(true);
      expect(calls.findIndex(c => c.includes('pnpm info'))).toBeLessThan(
        calls.findIndex(c => c.includes('pnpm search'))
      );
    });
  });
});
