/**
 * @fileoverview CLI 入口集成测试
 * @description
 * `bin/cli.mjs` 内部对真实 CLI 使用 `stdio: 'inherit'`，外层 `spawnSync` 无法采集子进程 stdout，
 * 因此对有输出的断言改为直接执行 `dist/cli.mjs`（与 bin 相同的 loader + `package.json` → `ts-node`）。
 * 仍可将 `bin/cli.mjs` 用于仅需断言退出码的场景。
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  resolveTsNodeChildEnv,
  resolveTsNodeEsmLoaderUrl
} from '../bin/ts-node-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const binCli = path.join(repoRoot, 'bin', 'cli.mjs');
const distCli = path.join(repoRoot, 'dist', 'cli.mjs');

const tsNodeEsmLoaderUrl = resolveTsNodeEsmLoaderUrl();

/** 无额外 `.cmd` / `.plugin` 的目录，避免扫描仓库内示例产生不稳定结果 */
const emptyCwd = path.join(repoRoot, 'test', 'fixtures', 'empty-cli-cwd');

const pkg = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8')
) as { version: string };

/** 与 bin 脚本一致的加载方式，便于断言 CLI 输出（stdout 可被采集） */
function runDistCli(args: string[]) {
  return spawnSync(
    process.execPath,
    ['--loader', tsNodeEsmLoaderUrl, distCli, ...args],
    {
      cwd: emptyCwd,
      encoding: 'utf-8',
      env: resolveTsNodeChildEnv(process.env)
    }
  );
}

function runBinScript(args: string[]) {
  return spawnSync(process.execPath, [binCli, ...args], {
    cwd: emptyCwd,
    encoding: 'utf-8',
    // 避免默认 stdin 管道与 bin 内 `stdio: 'inherit'` 子进程组合导致挂起
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_NO_WARNINGS: '1' }
  });
}

describe.skipIf(!fs.existsSync(distCli))(
  'dist/cli.mjs（与 bin 等价的 node+loader 启动）',
  { timeout: 20_000 },
  () => {
    it('应输出 --help 且以 0 退出', () => {
      const r = runDistCli(['--help']);
      expect(r.status).toBe(0);
      const out = `${r.stdout}${r.stderr}`;
      expect(out).toMatch(/Usage:|用法/i);
    });

    it('应输出 --version 且含 package 版本号', { timeout: 20_000 }, () => {
      const r = runDistCli(['--version']);
      expect(r.status).toBe(0);
      expect(`${r.stdout}${r.stderr}`).toContain(pkg.version);
    });

    it('未知子命令应非 0 退出', { timeout: 20_000 }, () => {
      const r = runDistCli(['__not_a_real_command_xyz__']);
      expect(r.status).not.toBe(0);
    });
  }
);

describe.skipIf(!fs.existsSync(distCli))('bin/cli.mjs', () => {
  it(
    '应能运行并以与 dist 相同的退出码结束（stdio inherit 下不设断言输出）',
    { timeout: 20_000 },
    () => {
      const a = runBinScript(['--version']);
      const b = runDistCli(['--version']);
      expect(a.status).toBe(b.status);
      expect(a.status).toBe(0);
    }
  );
});
