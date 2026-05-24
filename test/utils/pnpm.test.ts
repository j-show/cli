/**
 * @fileoverview `utils/pnpm` 契约测试
 * @description 对齐 `findPnpmWorkspaceRoot`：向上查找 `pnpm-workspace.yaml` 与深度上限。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  findPnpmWorkspaceRoot,
  PNPM_WORKSPACE_FILE
} from '../../src/utils/pnpm';

describe('findPnpmWorkspaceRoot', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  const mkTmp = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jshow-pnpm-'));
    tmpDirs.push(dir);
    return dir;
  };

  it('startDir 含 workspace 文件时应返回该目录', () => {
    const root = mkTmp();
    fs.writeFileSync(
      path.join(root, PNPM_WORKSPACE_FILE),
      'packages:\n  - packages/*\n'
    );

    expect(findPnpmWorkspaceRoot(root)).toBe(root);
  });

  it('应向上查找父目录中的 workspace 根', () => {
    const root = mkTmp();
    const child = path.join(root, 'packages', 'core');
    fs.mkdirSync(child, { recursive: true });
    fs.writeFileSync(
      path.join(root, PNPM_WORKSPACE_FILE),
      'packages:\n  - packages/*\n'
    );

    expect(findPnpmWorkspaceRoot(child)).toBe(root);
  });

  it('默认 max=3 时超过深度应返回 null', () => {
    const root = mkTmp();
    const deep = path.join(root, 'a', 'b', 'c', 'd');
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(
      path.join(root, PNPM_WORKSPACE_FILE),
      'packages:\n  - packages/*\n'
    );

    expect(findPnpmWorkspaceRoot(deep)).toBeNull();
  });

  it('自定义 max 足够时应找到更深层级上的根', () => {
    const root = mkTmp();
    const deep = path.join(root, 'a', 'b', 'c', 'd');
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(
      path.join(root, PNPM_WORKSPACE_FILE),
      'packages:\n  - packages/*\n'
    );

    expect(findPnpmWorkspaceRoot(deep, 10)).toBe(root);
  });

  it('无 workspace 文件时应返回 null', () => {
    const dir = mkTmp();
    const leaf = path.join(dir, 'only', 'pkg');
    fs.mkdirSync(leaf, { recursive: true });

    expect(findPnpmWorkspaceRoot(leaf)).toBeNull();
  });

  it('max < 0 时应立即返回 null', () => {
    expect(findPnpmWorkspaceRoot('/any', -1)).toBeNull();
  });
});
