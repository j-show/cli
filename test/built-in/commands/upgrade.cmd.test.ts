/* eslint-disable @typescript-eslint/consistent-type-imports */
/**
 * @fileoverview 内置命令 `upgrade` 契约测试
 * @description 对齐 `upgrade.cmd.ts`：先 checkbox 再查 registry；写回后 install/commit/push。
 */

import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UpgradeCommand } from '../../../src/built-in/commands/upgrade.cmd';
import type { PackageJson } from '../../../src/utils';
import * as utils from '../../../src/utils';

vi.mock('../../../src/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/utils')>();
  return {
    ...actual,
    getGroupPackages: vi.fn(),
    execSync: vi.fn(),
    readJsonSync: vi.fn(),
    writeJsonSync: vi.fn(),
    readPnpmCatalogs: vi.fn(),
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
    devDependencies?: Record<string, string>;
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

const multiLodash = () =>
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

/** 无 scope 字段，写回时目标版本为 registry 解析值而非 `*` */
const multiLodashPlain = () =>
  multiPkg({
    dir: '/ws/p1',
    name: 'pkg-one',
    manifest: {
      name: 'pkg-one',
      version: '1.0.0',
      dependencies: { lodash: '^4.17.0' }
    }
  });

const pkgDir = path.join('/ws/p1');
const pkgJsonPath = path.join(pkgDir, 'package.json');

const norm = (p: unknown) => String(p).replace(/\\/g, '/');

describe('UpgradeCommand', () => {
  let upgrade: UpgradeCommand;

  beforeEach(() => {
    upgrade = new UpgradeCommand(new Command('upgrade'), []);
    vi.mocked(utils.getGroupPackages).mockReturnValue([]);
    vi.mocked(utils.execSync).mockReturnValue('');
    vi.mocked(utils.readPnpmCatalogs).mockReturnValue({});
    vi.mocked(utils.checkboxInquirer).mockResolvedValue([]);
    vi.mocked(utils.confirmInquirer).mockResolvedValue(false);
    vi.mocked(utils.inputInquirer).mockResolvedValue('');
    vi.mocked(utils.readJsonSync).mockReturnValue(null);
    vi.mocked(utils.writeJsonSync).mockImplementation(() => {});
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
        multiLodash(),
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
    it('应先 checkbox 再对选中项 pnpm info', async () => {
      vi.mocked(utils.getGroupPackages).mockReturnValue([multiLodash()]);
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
      vi.mocked(utils.getGroupPackages).mockReturnValue([multiLodash()]);
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

    it('精确版本已满足 registry 时不应进入确认写回', async () => {
      vi.mocked(utils.getGroupPackages).mockReturnValue([
        multiPkg({
          dir: '/ws/p1',
          name: 'pkg-one',
          manifest: {
            name: 'pkg-one',
            version: '1.0.0',
            dependencies: { lodash: '4.17.21' }
          }
        })
      ]);
      vi.mocked(utils.checkboxInquirer).mockResolvedValue(['lodash']);
      vi.mocked(utils.execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('pnpm info')) {
          return JSON.stringify({ name: 'lodash', version: '4.17.21' });
        }
        return '';
      });

      await upgrade.execute({
        name: 'upgrade',
        args: ['.'],
        options: { ...defaultOptions },
        startTime: Date.now()
      });

      expect(utils.writeJsonSync).not.toHaveBeenCalled();
    });

    it('force 且确认版本时应写回、install 并提交', async () => {
      vi.mocked(utils.getGroupPackages).mockReturnValue([multiLodashPlain()]);
      vi.mocked(utils.checkboxInquirer).mockResolvedValue(['lodash']);
      vi.mocked(utils.confirmInquirer).mockResolvedValue(true);
      vi.mocked(utils.readJsonSync).mockImplementation((p: unknown) => {
        if (norm(p).endsWith('/ws/p1/package.json')) {
          return {
            name: 'pkg-one',
            version: '1.0.0',
            dependencies: { lodash: '^4.17.0' }
          } satisfies PackageJson;
        }
        return null;
      });
      vi.mocked(utils.getUnCommittedFiles).mockReturnValue(['package.json']);
      vi.mocked(utils.execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('pnpm info')) {
          return JSON.stringify({ name: 'lodash', version: '4.17.21' });
        }
        return '';
      });

      await upgrade.execute({
        name: 'upgrade',
        args: ['.'],
        options: { ...defaultOptions, force: true },
        startTime: Date.now()
      });

      expect(utils.writeJsonSync).toHaveBeenCalledWith(
        pkgJsonPath,
        expect.objectContaining({
          dependencies: { lodash: '4.17.21' }
        })
      );
      expect(utils.installPnpm).toHaveBeenCalledWith(pkgDir);
      expect(utils.addGit).toHaveBeenCalledWith(pkgDir);
      expect(utils.commitGit).toHaveBeenCalled();
      expect(utils.pushGit).not.toHaveBeenCalled();
    });

    it('用户拒绝提交时不应 commit', async () => {
      vi.mocked(utils.getGroupPackages).mockReturnValue([multiLodashPlain()]);
      vi.mocked(utils.checkboxInquirer).mockResolvedValue(['lodash']);
      vi.mocked(utils.confirmInquirer).mockImplementation(async msg => {
        if (String(msg).includes('Continue commit')) return false;
        return true;
      });
      vi.mocked(utils.readJsonSync).mockReturnValue({
        name: 'pkg-one',
        version: '1.0.0',
        dependencies: { lodash: '^4.17.0' }
      });
      vi.mocked(utils.execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('pnpm info')) {
          return JSON.stringify({ name: 'lodash', version: '4.17.21' });
        }
        return '';
      });

      await upgrade.execute({
        name: 'upgrade',
        args: ['.'],
        options: { ...defaultOptions },
        startTime: Date.now()
      });

      expect(utils.writeJsonSync).toHaveBeenCalled();
      expect(utils.installPnpm).toHaveBeenCalled();
      expect(utils.commitGit).not.toHaveBeenCalled();
    });

    it('force + push 且有未提交变更时应 push', async () => {
      vi.mocked(utils.getGroupPackages).mockReturnValue([multiLodashPlain()]);
      vi.mocked(utils.checkboxInquirer).mockResolvedValue(['lodash']);
      vi.mocked(utils.confirmInquirer).mockResolvedValue(true);
      vi.mocked(utils.readJsonSync).mockReturnValue({
        name: 'pkg-one',
        version: '1.0.0',
        dependencies: { lodash: '^4.17.0' }
      });
      vi.mocked(utils.getUnCommittedFiles).mockReturnValue(['package.json']);
      vi.mocked(utils.execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('pnpm info')) {
          return JSON.stringify({ name: 'lodash', version: '4.17.21' });
        }
        return '';
      });

      await upgrade.execute({
        name: 'upgrade',
        args: ['.'],
        options: { ...defaultOptions, force: true, push: true },
        startTime: Date.now()
      });

      expect(utils.pushGit).toHaveBeenCalledWith(pkgDir);
    });
  });

  describe('monorepo', () => {
    const monoRoot = () => ({
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
    });

    it('应先 checkbox、pnpm info，再 pnpm search scope 私有包', async () => {
      vi.mocked(utils.getGroupPackages).mockReturnValue([monoRoot()]);
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
      expect(utils.execSync).toHaveBeenCalledWith(
        expect.stringContaining('pnpm search'),
        expect.objectContaining({ cwd: '/repo/root' })
      );
    });

    it('force 写回后应在 monorepo 根 install 并提交', async () => {
      vi.mocked(utils.getGroupPackages).mockReturnValue([monoRoot()]);
      vi.mocked(utils.checkboxInquirer).mockResolvedValue(['external-pkg']);
      vi.mocked(utils.confirmInquirer).mockResolvedValue(true);
      vi.mocked(utils.readJsonSync).mockImplementation((p: unknown) => {
        const v = norm(p);
        if (v.endsWith('/repo/root/package.json')) {
          return {
            name: 'mono-root',
            version: '1.0.0',
            dependencies: { 'external-pkg': '^1.0.0' }
          } satisfies PackageJson;
        }
        if (v.endsWith('/repo/packages/app/package.json')) {
          return {
            name: '@myorg/app',
            version: '1.0.0',
            dependencies: { 'external-pkg': '1.0.0' }
          } satisfies PackageJson;
        }
        return null;
      });
      vi.mocked(utils.getUnCommittedFiles).mockReturnValue(['package.json']);
      vi.mocked(utils.execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('pnpm info')) {
          return JSON.stringify({ name: 'external-pkg', version: '1.0.1' });
        }
        if (cmd.includes('pnpm search')) return '';
        return '';
      });

      await upgrade.execute({
        name: 'upgrade',
        args: ['.'],
        options: { ...defaultOptions, force: true },
        startTime: Date.now()
      });

      expect(utils.installPnpm).toHaveBeenCalledWith('/repo/root');
      expect(utils.commitGit).toHaveBeenCalledWith(
        expect.anything(),
        '/repo/root'
      );
    });
  });
});
