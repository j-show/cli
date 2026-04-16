#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

// Always use the ts-node version shipped with this package.
const tsNodeEsmLoader = require.resolve('ts-node/esm');
// Windows: bare absolute paths are not valid module URLs for the ESM loader pipeline.
const tsNodeEsmLoaderUrl = pathToFileURL(tsNodeEsmLoader).href;

/**
 * 与 `package.json` 中 `ts-node.compilerOptions` 保持一致，
 * 供未自行设置 `TS_NODE_COMPILER_OPTIONS` 时使用。
 */
const TSCONFIG = {
  target: 'ESNext',
  module: 'NodeNext',
  moduleResolution: 'NodeNext',
  allowJs: true,
  experimentalDecorators: true,
  emitDecoratorMetadata: true,
  esModuleInterop: true,
  allowSyntheticDefaultImports: true,
  resolveJsonModule: true,
  skipLibCheck: true
};

// Execute the built CLI with ts-node's ESM loader enabled,
// so runtime-loaded *.ts commands/plugins can be imported.
const cliEntry = new URL('../dist/cli.mjs', import.meta.url);
const cliEntryPath = fileURLToPath(cliEntry);

const result = spawnSync(
  process.execPath,
  ['--loader', tsNodeEsmLoaderUrl, cliEntryPath, ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
      // 源码中 `isTsNodeRuntime` 用这些变量判断是否扫描 `.ts` 命令/插件。
      // Only set a minimal value when the user hasn't configured it.
      TS_NODE_COMPILER_OPTIONS:
        process.env.TS_NODE_COMPILER_OPTIONS ?? JSON.stringify(TSCONFIG)
    }
  }
);

process.exit(result.status ?? 1);
