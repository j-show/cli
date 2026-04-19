#!/usr/bin/env node
/**
 * 在空 fixture 目录下调用 `bin/cli.mjs`，与集成测试一致。
 * 无参时默认传 `--help`：仅 `jshow` 无子命令时 Commander 会打印帮助但 **exit 1**，显式 `--help` 才为 0。
 * 额外参数：`pnpm run test:cli -- --version`（`--` 后交给本脚本，再转发给 CLI）。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cwd = path.join(root, 'tests', 'fixtures', 'empty-cli-cwd');
const bin = path.join(root, 'bin', 'cli.mjs');

const forwarded = process.argv.slice(2);
const cliArgs = forwarded.length > 0 ? forwarded : [];

const result = spawnSync(process.execPath, [bin, ...cliArgs], {
  cwd,
  stdio: 'inherit'
});

process.exit(result.status ?? 1);
