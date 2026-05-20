#!/usr/bin/env node
/**
 * @fileoverview 发布的 `jshow` 可执行入口
 * @description
 * 使用本包 `package.json` → `ts-node` 配置与 `ts-node/esm/transpile-only` loader 启动 `dist/cli.mjs`，
 * 以便在运行时 `import()` 工作区内的 `.cmd.ts` / `.plugin.ts`。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  resolveTsNodeChildEnv,
  resolveTsNodeEsmLoaderUrl
} from './ts-node-env.mjs';

let tsNodeEsmLoaderUrl;
try {
  tsNodeEsmLoaderUrl = resolveTsNodeEsmLoaderUrl();
} catch {
  console.error(
    '找不到 ts-node。若在开发仓库通过 symlink 调试全局 jshow，请先在 jshow-cli 目录执行：pnpm install'
  );
  process.exit(1);
}

const cliEntryPath = fileURLToPath(new URL('../dist/cli.mjs', import.meta.url));

if (!fs.existsSync(cliEntryPath)) {
  console.error(
    `找不到构建产物：${cliEntryPath}\n` +
      '请先在本包目录执行 pnpm build；若已通过 ln -s 映射 dist，请确认链接目标存在且已构建。'
  );
  process.exit(1);
}

/** 仅调试已构建 dist、不需要加载工作区 .cmd.ts 时可设为 1（等价于 node dist/cli.mjs） */
const noTsLoader = process.env.JSHOW_CLI_NO_TS_LOADER === '1';
const nodeArgs = noTsLoader
  ? [cliEntryPath, ...process.argv.slice(2)]
  : ['--loader', tsNodeEsmLoaderUrl, cliEntryPath, ...process.argv.slice(2)];

const result = spawnSync(process.execPath, nodeArgs, {
  stdio: 'inherit',
  env: noTsLoader ? process.env : resolveTsNodeChildEnv(process.env)
});

if ((result.status ?? 1) !== 0 && !noTsLoader) {
  console.error(
    '\njshow 子进程异常退出。若仅看到 [Object: null prototype]，多为 ts-node 编译错误被 Node 吞掉；\n' +
      '可尝试：pnpm build 后执行 JSHOW_CLI_NO_TS_LOADER=1 jshow -v，或 TS_NODE_LOG_ERROR=true jshow -v'
  );
}

process.exit(result.status ?? 1);
