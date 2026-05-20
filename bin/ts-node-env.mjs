/**
 * @fileoverview 从 `package.json` → `ts-node` 生成子进程环境变量（单一配置源）
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

const pkg = JSON.parse(
  fs.readFileSync(
    fileURLToPath(new URL('../package.json', import.meta.url)),
    'utf-8'
  )
);
const tsNode = pkg['ts-node'] ?? {};

/** @returns {string} ts-node ESM transpile-only loader 的 file URL */
export const resolveTsNodeEsmLoaderUrl = () => {
  const loader = require.resolve('ts-node/esm/transpile-only');
  return pathToFileURL(loader).href;
};

/**
 * 供 `spawn` 子进程使用的 ts-node 相关环境变量（读取 `package.json` → `ts-node`）。
 * @param {NodeJS.ProcessEnv} [base]
 * @returns {NodeJS.ProcessEnv}
 */
export const resolveTsNodeChildEnv = (base = process.env) => {
  const ignore = tsNode.ignore ?? ['(?:^|/)node_modules/', '(?:^|/)dist/'];
  const env = {
    ...base,
    NODE_NO_WARNINGS: '1',
    JSHOW_CLI_TS_RUNTIME: '1'
  };

  if (tsNode.skipProject !== false) {
    env.TS_NODE_SKIP_PROJECT = base.TS_NODE_SKIP_PROJECT ?? 'true';
  }
  if (tsNode.transpileOnly !== false) {
    env.TS_NODE_TRANSPILE_ONLY = base.TS_NODE_TRANSPILE_ONLY ?? 'true';
  }
  env.TS_NODE_IGNORE = base.TS_NODE_IGNORE ?? ignore.join(',');

  if (tsNode.compilerOptions && !base.TS_NODE_COMPILER_OPTIONS) {
    env.TS_NODE_COMPILER_OPTIONS = JSON.stringify(tsNode.compilerOptions);
  }

  return env;
};
