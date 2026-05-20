/**
 * @fileoverview `utils/node` 纯函数契约测试
 */

import { describe, expect, it } from 'vitest';

import {
  execSync,
  isFsSkippedError,
  isIgnoreDir,
  separateGroupPackages,
  type PackageGroup
} from '../../src/utils/node';

describe('execSync', () => {
  it('默认应通过 pipe 返回 stdout', () => {
    const marker = 'jshow-exec-sync-pipe-test';
    const out = execSync(`node -e "console.log('${marker}')"`);
    expect(out).toBe(marker);
  });

  it('verbose: true 继承终端且不返回 stdout', () => {
    const marker = 'jshow-exec-sync-verbose-test';
    const out = execSync(`node -e "console.log('${marker}')"`, {
      verbose: true
    });
    expect(out).toBe('');
  });
});

describe('isFsSkippedError', () => {
  it('应识别 EPERM/EACCES/ENOENT/EBUSY', () => {
    expect(isFsSkippedError({ code: 'EPERM' })).toBe(true);
    expect(isFsSkippedError({ code: 'EACCES' })).toBe(true);
    expect(isFsSkippedError({ code: 'ENOENT' })).toBe(true);
    expect(isFsSkippedError({ code: 'EBUSY' })).toBe(true);
  });

  it('其它错误不应视为可跳过', () => {
    expect(isFsSkippedError({ code: 'EISDIR' })).toBe(false);
    expect(isFsSkippedError(null)).toBe(false);
    expect(isFsSkippedError('EPERM')).toBe(false);
  });
});

describe('isIgnoreDir', () => {
  it('应忽略点开头的目录与 node_modules、dist', () => {
    expect(isIgnoreDir('.git')).toBe(true);
    expect(isIgnoreDir('node_modules')).toBe(true);
    expect(isIgnoreDir('dist')).toBe(true);
  });

  it('普通目录名不应忽略', () => {
    expect(isIgnoreDir('packages')).toBe(false);
    expect(isIgnoreDir('src')).toBe(false);
  });
});

describe('separateGroupPackages', () => {
  const base = {
    dir: '/x',
    name: 'x',
    manifest: { name: 'x', version: '1.0.0' }
  };

  it('children 为空应归入 multiPackages', () => {
    const group: PackageGroup = { ...base, children: [] };
    const [multi, mono] = separateGroupPackages([group]);
    expect(multi).toHaveLength(1);
    expect(mono).toHaveLength(0);
  });

  it('children 非空应归入 monorepoPackages', () => {
    const child = { ...base, name: 'child', dir: '/x/c' };
    const group: PackageGroup = { ...base, children: [child] };
    const [multi, mono] = separateGroupPackages([group]);
    expect(multi).toHaveLength(0);
    expect(mono).toHaveLength(1);
    expect(mono[0].children).toEqual([child]);
  });
});
