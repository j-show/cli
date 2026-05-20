/* eslint-disable @typescript-eslint/consistent-type-imports */
/**
 * @fileoverview 内置命令 `backup` 契约测试
 */

import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackupCommand } from '../../../src/built-in/commands/backup.cmd';
import * as utils from '../../../src/utils';

vi.mock('../../../src/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/utils')>();
  return {
    ...actual,
    getGroupPackages: vi.fn(),
    pullCurrentBranch: vi.fn(),
    mkdirSync: vi.fn(),
    eachDirSync: vi.fn(),
    cpSync: vi.fn(),
    existsSync: vi.fn()
  };
});

const pkgA = {
  dir: '/ws/packages/a',
  name: '@scope/pkg-a',
  manifest: { name: '@scope/pkg-a', version: '0.0.0' },
  children: [] as never[]
};

describe('BackupCommand', () => {
  let backup: BackupCommand;

  beforeEach(() => {
    backup = new BackupCommand(new Command('backup'), []);
    vi.mocked(utils.getGroupPackages).mockReturnValue([pkgA]);
    vi.mocked(utils.existsSync).mockImplementation(p => {
      const v = String(p).replace(/\\/g, '/');
      return v.endsWith('/.git');
    });
    vi.mocked(utils.eachDirSync).mockImplementation((_root, cb) => {
      (cb as (name: string) => void)('lib');
    });
  });

  afterEach(() => vi.clearAllMocks());

  it('static key 应为 backup', () => {
    expect(BackupCommand.key).toBe('backup');
  });

  it('args 应声明 input/output 位置参数与 clean、filter 选项', () => {
    const { args } = backup;
    expect(args.name).toBe('backup');
    expect(args.group).toBe('devOps');
    expect(args.arguments?.map(a => a.name)).toEqual(['input', 'output']);
    expect(args.options?.map(o => o.name)).toEqual(['clean', 'filter']);
  });

  it('有 .git 时应 pull，再 mkdir 并 cpSync 一级子项', async () => {
    await backup.execute({
      name: 'backup',
      args: ['/ws', '/out'],
      options: { filter: '', clean: true },
      startTime: Date.now()
    });

    expect(utils.getGroupPackages).toHaveBeenCalledWith(path.resolve('/ws'));
    expect(utils.pullCurrentBranch).toHaveBeenCalledWith(
      true,
      pkgA.dir,
      expect.any(Boolean)
    );
    expect(utils.mkdirSync).toHaveBeenCalled();
    expect(utils.cpSync).toHaveBeenCalledTimes(1);
    const [from, to] = vi.mocked(utils.cpSync).mock.calls[0];
    expect(from).toMatch(/[/\\]lib$/);
    expect(to).toMatch(/[/\\]a[/\\]lib$/);
  });

  it('无 .git 时不应 pull', async () => {
    vi.mocked(utils.existsSync).mockReturnValue(false);

    await backup.execute({
      name: 'backup',
      args: ['/ws', '/out'],
      options: { filter: '', clean: true },
      startTime: Date.now()
    });

    expect(utils.pullCurrentBranch).not.toHaveBeenCalled();
    expect(utils.cpSync).toHaveBeenCalled();
  });

  it('monorepo 有 children 时应备份各子包而非仅根目录', async () => {
    const pkgAChild = path.resolve('/ws/packages/a');
    const pkgBChild = path.resolve('/ws/packages/b');

    vi.mocked(utils.getGroupPackages).mockReturnValue([
      {
        dir: path.resolve('/ws'),
        name: 'root',
        manifest: { name: 'root', version: '0.0.0', private: true },
        children: [
          {
            dir: pkgAChild,
            name: '@scope/a',
            manifest: { name: '@scope/a', version: '0.0.0' }
          },
          {
            dir: pkgBChild,
            name: '@scope/b',
            manifest: { name: '@scope/b', version: '0.0.0' }
          }
        ]
      }
    ]);
    vi.mocked(utils.existsSync).mockImplementation(p => {
      const v = String(p).replace(/\\/g, '/');
      return v.endsWith('/.git');
    });

    await backup.execute({
      name: 'backup',
      args: [path.resolve('/ws'), path.resolve('/out')],
      options: { filter: '', clean: true },
      startTime: Date.now()
    });

    expect(utils.pullCurrentBranch).toHaveBeenCalledTimes(2);
    expect(utils.mkdirSync).toHaveBeenCalledTimes(2);
    const mkdirPaths = vi.mocked(utils.mkdirSync).mock.calls.map(c => c[0]);
    expect(mkdirPaths.some(p => p.endsWith(`${path.sep}a`))).toBe(true);
    expect(mkdirPaths.some(p => p.endsWith(`${path.sep}b`))).toBe(true);
  });

  it('无 package.json 时应按各 .git 仓库以此备份', async () => {
    const inputRoot = path.resolve('/ws');
    const outputRoot = path.resolve('/out');
    const repoA = path.join(inputRoot, 'repo-a');
    const repoB = path.join(inputRoot, 'repo-b');

    vi.mocked(utils.getGroupPackages).mockReturnValue([]);
    vi.mocked(utils.existsSync).mockImplementation(p => {
      const v = path.resolve(String(p));
      if (v === path.join(repoA, '.git') || v === path.join(repoB, '.git')) {
        return true;
      }
      return v === inputRoot || v === repoA || v === repoB;
    });
    vi.mocked(utils.eachDirSync).mockImplementation((root, cb) => {
      const r = path.resolve(String(root));
      if (r === inputRoot) {
        for (const name of ['repo-a', 'repo-b']) {
          (cb as (name: string, ph: string) => void)(name, path.join(r, name));
        }
        return;
      }
      (cb as (name: string) => void)('lib');
    });

    await backup.execute({
      name: 'backup',
      args: [inputRoot, outputRoot],
      options: { filter: '', clean: true },
      startTime: Date.now()
    });

    expect(utils.mkdirSync).toHaveBeenCalledTimes(2);
    const mkdirPaths = vi.mocked(utils.mkdirSync).mock.calls.map(c => c[0]);
    expect(mkdirPaths).toContain(path.join(outputRoot, 'repo-a'));
    expect(mkdirPaths).toContain(path.join(outputRoot, 'repo-b'));
    expect(utils.cpSync).toHaveBeenCalled();
  });

  it('input 根目录自身含 .git 时应作为单个仓库备份', async () => {
    const inputRoot = path.resolve('/ws');
    const outputRoot = path.resolve('/out');

    vi.mocked(utils.getGroupPackages).mockReturnValue([]);
    vi.mocked(utils.existsSync).mockImplementation(p => {
      const v = path.resolve(String(p));
      return v === inputRoot || v === path.join(inputRoot, '.git');
    });

    await backup.execute({
      name: 'backup',
      args: [inputRoot, outputRoot],
      options: { filter: '', clean: true },
      startTime: Date.now()
    });

    expect(utils.mkdirSync).toHaveBeenCalledWith(
      path.join(outputRoot, path.basename(inputRoot))
    );
  });

  it('filter 应按包名正则过滤（使用真实 toPatterns）', async () => {
    vi.mocked(utils.getGroupPackages).mockReturnValue([
      { ...pkgA, dir: '/ws/p1', name: '@scope/keep' },
      {
        dir: '/ws/p2',
        name: '@scope/skip',
        manifest: { name: '@scope/skip', version: '0.0.0' },
        children: []
      }
    ]);

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
  });

  it('clean=true 时应跳过 node_modules 与 .git', async () => {
    vi.mocked(utils.eachDirSync).mockImplementation((_root, cb) => {
      for (const name of ['node_modules', '.git', 'src']) {
        (cb as (name: string) => void)(name);
      }
    });

    await backup.execute({
      name: 'backup',
      args: ['/ws', '/out'],
      options: { filter: '', clean: true },
      startTime: Date.now()
    });

    const copied = vi.mocked(utils.cpSync).mock.calls.map(c => c[0]);
    expect(copied.some(p => p.endsWith(`${path.sep}node_modules`))).toBe(false);
    expect(copied.some(p => p.endsWith(`${path.sep}.git`))).toBe(false);
    expect(copied.some(p => p.endsWith(`${path.sep}src`))).toBe(true);
  });

  it('无任何备份目标时应 exit(1)', async () => {
    vi.mocked(utils.getGroupPackages).mockReturnValue([]);
    vi.mocked(utils.existsSync).mockReturnValue(false);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code = 1) => {
      throw new Error(`exit:${code}`);
    });

    await expect(
      backup.execute({
        name: 'backup',
        args: ['/empty', '/out'],
        options: { filter: '', clean: true },
        startTime: Date.now()
      })
    ).rejects.toThrow('exit:1');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(utils.cpSync).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it('pull 失败时不应阻断后续 copy', async () => {
    vi.mocked(utils.pullCurrentBranch).mockImplementation(() => {
      throw new Error('pull failed');
    });

    await backup.execute({
      name: 'backup',
      args: ['/ws', '/out'],
      options: { filter: '', clean: true },
      startTime: Date.now()
    });

    expect(utils.cpSync).toHaveBeenCalled();
  });

  it('clean=false 时应复制 .git，仍跳过 node_modules', async () => {
    vi.mocked(utils.eachDirSync).mockImplementation((_root, cb) => {
      for (const name of ['node_modules', '.git', 'src']) {
        (cb as (name: string) => void)(name);
      }
    });

    await backup.execute({
      name: 'backup',
      args: ['/ws', '/out'],
      options: { filter: '', clean: false },
      startTime: Date.now()
    });

    const copied = vi.mocked(utils.cpSync).mock.calls.map(c => c[0]);
    expect(copied.some(p => p.endsWith(`${path.sep}node_modules`))).toBe(false);
    expect(copied.some(p => p.endsWith(`${path.sep}.git`))).toBe(true);
    expect(copied.some(p => p.endsWith(`${path.sep}src`))).toBe(true);
  });
});
