#!/usr/bin/env node
/**
 * @fileoverview 开发时在「空 fixture」目录下调用 `bin/cli.mjs`
 * @description
 * 工作目录为 `test/fixtures/empty-cli-cwd`（无额外 `.cmd` / `.plugin`），与 `test/bin-cli.test.ts` 一致。
 * 用法：`pnpm cli` 或 `pnpm cli -- --version`（`--` 后的参数原样转发给 CLI）。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cwd = path.join(root, 'test', 'fixtures', 'empty-cli-cwd');
const bin = path.join(root, 'bin', 'cli.mjs');

const cliArgs = process.argv.slice(2);

const result = spawnSync(process.execPath, [bin, ...cliArgs], {
  cwd,
  stdio: 'inherit'
});

process.exit(result.status ?? 1);
