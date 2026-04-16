/**
 * @fileoverview `bin/cli.mjs` 包装脚本集成测试
 * @description
 * 通过子进程执行入口脚本，验证其能拉起 `dist/cli.mjs` 并透传参数。
 * 使用无自定义命令/插件的 fixture 作为 `cwd`，避免在启用 ts-node 时扫描本仓库 `examples/` 等目录产生不稳定结果。
 * `NODE_NO_WARNINGS=1` 用于屏蔽 Node 对 `--loader` 的实验性告警，便于断言 CLI 真实输出。
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const binCli = path.join(repoRoot, 'bin', 'cli.mjs');
const distCli = path.join(repoRoot, 'dist', 'cli.mjs');
/** 无额外 `.cmd` / `.plugin` 的目录，避免在启用 ts-node 时扫描仓库内示例与源码导致冲突 */
const emptyCwd = path.join(repoRoot, 'tests', 'fixtures', 'empty-cli-cwd');

const pkg = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8')
) as { version: string };

function runBin(args: string[]) {
  return spawnSync(process.execPath, [binCli, ...args], {
    cwd: emptyCwd,
    encoding: 'utf-8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' }
  });
}

describe.skipIf(!fs.existsSync(distCli))('bin/cli.mjs', () => {
  it('应转发 --help 并以 0 退出', () => {
    const r = runBin(['--help']);
    expect(r.status).toBe(0);
    const out = `${r.stdout}${r.stderr}`;
    expect(out).toMatch(/Usage:|用法/i);
  });

  it('应转发 --version 并输出版本号', () => {
    const r = runBin(['--version']);
    expect(r.status).toBe(0);
    expect(`${r.stdout}${r.stderr}`).toContain(pkg.version);
  });

  it('未知子命令应非 0 退出', () => {
    const r = runBin(['__not_a_real_command_xyz__']);
    expect(r.status).not.toBe(0);
  });
});
