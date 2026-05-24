/* eslint-disable @typescript-eslint/consistent-type-imports */
/**
 * @fileoverview 内置命令 `publish` 契约测试
 * @description 对齐 `publish.cmd.ts`：manifest 校验、workspace/catalog 解析与 `npm publish`。
 */

import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PublishCommand } from '../../../src/built-in/commands/publish.cmd';
import type { PackageJson } from '../../../src/utils';
import * as utils from '../../../src/utils';

vi.mock('../../../src/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/utils')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readJsonSync: vi.fn(),
    writeJsonSync: vi.fn(),
    execSync: vi.fn(),
    findPnpmWorkspaceRoot: vi.fn(),
    getWorkspacePackages: vi.fn(),
    readPnpmCatalogs: vi.fn()
  };
});

describe('PublishCommand', () => {
  let publish: PublishCommand;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  const targetDir = path.resolve('/repo/packages/core');
  const pkgFile = path.join(targetDir, 'package.json');

  const baseManifest: PackageJson = {
    name: '@scope/pkg',
    version: '1.0.0',
    private: false,
    devDependencies: { vitest: '^4' },
    dependencies: {
      lodash: '^4.0.0',
      'ws-pkg': 'workspace:^'
    }
  };

  beforeEach(() => {
    publish = new PublishCommand(new Command('publish'), []);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    vi.mocked(utils.existsSync).mockImplementation(p => p === pkgFile);
    vi.mocked(utils.readJsonSync).mockReturnValue(baseManifest);
    vi.mocked(utils.findPnpmWorkspaceRoot).mockReturnValue('/repo');
    vi.mocked(utils.getWorkspacePackages).mockReturnValue([
      {
        dir: targetDir,
        name: 'ws-pkg',
        manifest: { name: 'ws-pkg', version: '2.0.0' }
      }
    ]);
    vi.mocked(utils.readPnpmCatalogs).mockReturnValue({});
    vi.mocked(utils.writeJsonSync).mockImplementation(() => {});
    vi.mocked(utils.execSync).mockReturnValue('');
  });

  afterEach(() => {
    exitSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('CLI 声明', () => {
    it('static key 应为 publish', () => {
      expect(PublishCommand.key).toBe('publish');
    });

    it('args 应声明 input 参数且无额外选项', () => {
      const { args } = publish;
      expect(args.name).toBe('publish');
      expect(args.group).toBe('devOps');
      expect(args.arguments?.map(a => a.name)).toEqual(['input']);
      expect(args.options ?? []).toEqual([]);
    });
  });

  describe('中止路径', () => {
    it('缺少 package.json 时应 exit(1)', async () => {
      vi.mocked(utils.existsSync).mockReturnValue(false);

      await expect(
        publish.execute({
          name: 'publish',
          args: [targetDir],
          options: {},
          startTime: Date.now()
        })
      ).rejects.toThrow('process.exit(1)');

      expect(utils.execSync).not.toHaveBeenCalled();
    });

    it('manifest 无 name 时应 exit(1)', async () => {
      vi.mocked(utils.readJsonSync).mockReturnValue({ version: '1.0.0' });

      await expect(
        publish.execute({
          name: 'publish',
          args: [targetDir],
          options: {},
          startTime: Date.now()
        })
      ).rejects.toThrow('process.exit(1)');

      expect(utils.execSync).not.toHaveBeenCalled();
    });

    it('private 包应 exit(1)', async () => {
      vi.mocked(utils.readJsonSync).mockReturnValue({
        name: 'pkg',
        version: '1.0.0',
        private: true
      });

      await expect(
        publish.execute({
          name: 'publish',
          args: [targetDir],
          options: {},
          startTime: Date.now()
        })
      ).rejects.toThrow('process.exit(1)');

      expect(utils.execSync).not.toHaveBeenCalled();
    });

    it('publish 失败时应 exit(1)', async () => {
      vi.mocked(utils.execSync).mockImplementation(() => {
        throw new Error('npm publish failed');
      });

      await expect(
        publish.execute({
          name: 'publish',
          args: [targetDir],
          options: {},
          startTime: Date.now()
        })
      ).rejects.toThrow('process.exit(1)');
    });
  });

  describe('发布写回', () => {
    it('应移除 devDependencies、解析 workspace: 并执行 scoped npm publish', async () => {
      await publish.execute({
        name: 'publish',
        args: [targetDir],
        options: {},
        startTime: Date.now()
      });

      expect(utils.writeJsonSync).toHaveBeenCalled();
      const formatted = vi.mocked(utils.writeJsonSync).mock
        .calls[0][1] as PackageJson;
      expect(formatted.devDependencies).toBeUndefined();
      expect(formatted.dependencies?.['ws-pkg']).toBe('^2.0.0');
      expect(formatted.dependencies?.lodash).toBe('^4.0.0');

      expect(utils.execSync).toHaveBeenCalledWith(
        'npm publish --access public --no-git-checks',
        { cwd: targetDir }
      );

      expect(utils.writeJsonSync).toHaveBeenCalledTimes(1);
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('非 scoped 包应使用 npm publish（无 --access public）', async () => {
      vi.mocked(utils.readJsonSync).mockReturnValue({
        name: 'plain-pkg',
        version: '1.0.0',
        private: false
      });

      await publish.execute({
        name: 'publish',
        args: [targetDir],
        options: {},
        startTime: Date.now()
      });

      expect(utils.execSync).toHaveBeenCalledWith(
        'npm publish --no-git-checks',
        {
          cwd: targetDir
        }
      );
    });

    it('无 workspace 根时应以 targetDir 作为上下文目录', async () => {
      vi.mocked(utils.findPnpmWorkspaceRoot).mockReturnValue(null);

      await publish.execute({
        name: 'publish',
        args: [targetDir],
        options: {},
        startTime: Date.now()
      });

      expect(utils.getWorkspacePackages).toHaveBeenCalledWith(targetDir);
      expect(utils.readPnpmCatalogs).toHaveBeenCalledWith(targetDir);
    });
  });
});
