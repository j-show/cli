/**
 * @fileoverview 可执行 CLI 入口（构建为 `dist/cli.mjs`）
 * @description
 * 自 `process.cwd()` 扫描 `.plugin.ts|.js` 与 `.cmd.ts|.js`，注册到 `CommandProgram` 后调用 `initBuiltIn` 挂载内置命令并执行 `parseAsync`。
 * 本模块在加载末尾会立即启动 CLI；若仅需复用扫描逻辑请从 `utils` 等模块组合，而不要仅 side-effect import 本文件。
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { type CommandImportType, isCommand } from './command';
import { logger } from './logger';
import { isPlugin, type PluginImportType } from './plugin';
import { CommandProgram, initBuiltIn } from './program';
import { isIgnoreDir, lstatSyncSafe, readdirSyncSafe } from './utils';

/**
 * 命令/插件发现的最大递归深度（至少为 2）。
 * @description 可通过环境变量 `JSHOW_CLI_MAX_DEPTH` 覆盖，避免在极深目录树中扫描过久。
 */
const MAX_DEPTH = Math.max(
  2,
  parseInt(process.env.JSHOW_CLI_MAX_DEPTH || '2') || 2
);

/**
 * 跳过的顶层目录名列表（逗号分隔）。
 * @description 来自 `JSHOW_CLI_IGNORE_NAMES`，用于在 monorepo 中排除无关子项目。
 */
const IGNORE_NAMES = (process.env.JSHOW_CLI_IGNORE_NAMES || '').split(',');

/**
 * 从文件路径中提取命令名称
 * @param fn - 文件路径
 * @param key - 后缀类型：`cmd` 或 `plugin`
 * @returns 命令名称（去除扩展名和 .cmd | .plugin 后缀）
 * @example
 * getKey('/path/to/example.cmd.ts') // 'example'
 * getKey('/path/to/test.cmd.js') // 'test'
 */
const getKey = (fn: string, key: 'cmd' | 'plugin'): string =>
  path.basename(fn, path.extname(fn)).replace(`.${key}`, '');

/**
 * 判断当前进程是否处于 ts-node 运行时。
 *
 * @returns 是否允许加载 `.ts` 命令/插件文件
 * @internal
 * @description
 * 之所以需要该判断，是为了避免在“仅运行已构建产物（dist）”的场景里误加载源码 `.ts` 文件，
 * 进而导致 Node 直接执行 TypeScript 失败。
 */
const isTsNodeRuntime = (): boolean =>
  process.env.JSHOW_CLI_TS_RUNTIME === '1' ||
  process.execArgv.some(arg => arg.includes('ts-node')) ||
  Boolean(process.env.TS_NODE_PROJECT) ||
  Boolean(process.env.TS_NODE_COMPILER_OPTIONS);

/**
 * 当前 CLI 入口文件所在目录（如 `src/`、`dist/`）。
 * @returns 入口脚本所在目录；无法解析时退回 `process.cwd()`
 * @description
 * 使用 `process.argv[1]` 而非 `import.meta.url`，避免在同时产出 CJS/ESM 的入口里触发 TS1470，
 * 并与 `node ./dist/cli.mjs` 一类启动方式一致。
 * @internal
 */
const getCliModuleDir = (): string => {
  const main = process.argv[1];
  if (main == null || main === '') {
    return process.cwd();
  }
  return path.dirname(path.resolve(main));
};

/**
 * 打包后内置命令目录的规范化绝对路径（用于跳过对工作区同名路径的重复加载）。
 * @internal
 */
const BUILT_IN_COMMAND_PATH = path.normalize(
  path.resolve(getCliModuleDir(), 'built-in', 'commands')
);

/**
 * 判断路径是否位于 CLI 自带的 `built-in/commands` 目录下。
 * @param fn - 待检查的文件或目录路径
 * @returns 若位于内置命令目录树内则为 `true`
 * @description 避免把包内已注册的内置命令再当作用户项目文件扫描一遍。
 * @internal
 */
const isBuiltInCommandPath = (fn: string): boolean => {
  const abs = path.normalize(path.resolve(fn));
  return (
    abs === BUILT_IN_COMMAND_PATH ||
    abs.startsWith(BUILT_IN_COMMAND_PATH + path.sep)
  );
};

/**
 * 递归遍历目录，对符合条件的命令/插件源文件执行回调（实现上的命名保留历史拼写 `traversa`）。
 * @param root - 扫描根目录
 * @param callback - 命中 `.ts` / `.js` 文件时调用（路径为绝对或相对于扫描根的拼接路径）
 * @param ignore - 额外跳过的目录名（与 {@link isIgnoreDir} 叠加）
 * @param max - 最大目录深度（不含根为 0 的语义由 `level` 与循环共同约束）
 * @param level - 当前深度，调用方传入 `0` 即可
 * @returns 遍历结束时 resolved 的 Promise
 * @description
 * `.ts` 仅在 ts-node 相关环境（`execArgv` 含 `ts-node` 或存在 `TS_NODE_*` 变量）为真时参与加载，避免生产环境直接 `import()` 源码失败。
 * 跳过包内已注册的内置命令物理目录，避免重复加载。
 * @example
 * ```typescript
 * await traversaDirectory('./src', file => {
 *   console.log('Found file:', file);
 * }, ['node_modules', '.git']);
 * ```
 */
const traversaDirectory = async (
  root: string,
  callback: (fn: string) => void,
  ignore: string[] = [],
  max = 2,
  level = 0
): Promise<void> => {
  const allowTs = isTsNodeRuntime();
  const list = readdirSyncSafe(root);

  for (const item of list) {
    if (isIgnoreDir(item) || ignore.includes(item)) continue;

    const fn = path.join(root, item);
    if (isBuiltInCommandPath(fn)) continue;

    const stat = lstatSyncSafe(fn);
    if (!stat || stat.isSymbolicLink()) continue;

    if (stat.isDirectory()) {
      if (level < max) {
        await traversaDirectory(fn, callback, ignore, max, level + 1);
      }
      continue;
    }

    if (!stat.isFile()) continue;
    if (!fn.endsWith('.ts') && !fn.endsWith('.js')) continue;
    // 无 ts-node 时不加载 .ts，避免 Node 直接执行 TypeScript 报错
    if (fn.endsWith('.ts') && !allowTs) continue;

    await callback(fn);
  }
};

/**
 * 加载并注册插件
 * @param fn - 插件文件路径
 * @param log - 用于输出加载警告的日志器（与主入口 fork 的命名空间一致）
 * @returns Promise<void>
 * @description
 * 动态导入插件文件，验证是否为有效的插件类，然后注册到 CommandProgram。
 * 支持 TypeScript (.ts) 和 JavaScript (.js) 文件。
 * 支持 ES Module 和 CommonJS 格式。
 * 若类上未设置 `static key`，则用文件名推导并写入 `plugin.key`（与 {@link CommandProgram.install} 的注册键一致）。
 * 如果加载失败，会输出警告信息但不会中断程序执行。
 * @example
 * ```typescript
 * await loadPlugin('./plugins/my-plugin.plugin.ts');
 * await loadPlugin('./plugins/my-plugin.plugin.js');
 * ```
 */
const loadPlugin = async (fn: string, log: typeof logger): Promise<void> => {
  try {
    // 将相对路径转换为绝对路径，确保 import() 能正确解析
    // Node.js 的 import() 可以处理绝对路径（包括 Windows 路径）
    const absolutePath = path.isAbsolute(fn)
      ? fn
      : path.resolve(process.cwd(), fn);

    const fileUrl = pathToFileURL(absolutePath).href;
    const file = (await import(fileUrl)) as
      | PluginImportType
      | { [key: string]: unknown; default?: unknown };

    // 处理 CommonJS 和 ESM 模块
    // CommonJS: module.exports = X (Node.js 会自动将其作为 default 导出)
    // ESM: export default X
    const plugin = (file.default || file) as PluginImportType['default'];

    // 检查是否为有效的插件
    if (!isPlugin(plugin)) return;

    if (!plugin.key) plugin.key = getKey(fn, 'plugin');

    // 注册插件
    CommandProgram.install(plugin, plugin.force);
  } catch (error) {
    log.warn(
      `加载插件文件 "${fn}" 时出错`,
      error instanceof Error ? error.message : String(error)
    );
  }
};

/**
 * 加载并注册命令
 * @param fn - 命令文件路径
 * @param log - 用于输出加载错误的日志器
 * @returns Promise<void>
 * @description
 * 动态导入命令文件，验证是否为有效的命令类，然后注册到 CommandProgram。
 * 支持 TypeScript (.ts) 和 JavaScript (.js) 文件。
 * 支持 ES Module 和 CommonJS 格式。
 * 若类上未设置 `static key`，则用文件名推导并写入 `module.key`。
 * @example
 * ```typescript
 * await loadCommand('./commands/build.cmd.ts');
 * await loadCommand('./commands/build.cmd.js');
 * ```
 */
const loadCommand = async (fn: string, log: typeof logger): Promise<void> => {
  try {
    // 将相对路径转换为绝对路径，确保 import() 能正确解析
    // Node.js 的 import() 可以处理绝对路径（包括 Windows 路径）
    const absolutePath = path.isAbsolute(fn)
      ? fn
      : path.resolve(process.cwd(), fn);

    const fileUrl = pathToFileURL(absolutePath).href;
    const file = (await import(fileUrl)) as
      | CommandImportType
      | { [key: string]: unknown; default?: unknown };

    // 处理 CommonJS 和 ESM 模块
    // CommonJS: module.exports = X (Node.js 会自动将其作为 default 导出)
    // ESM: export default X
    const module = (file.default || file) as CommandImportType['default'];

    // 检查是否为有效的命令类
    if (!isCommand(module)) return;

    // 若未显式设置 static key，则用文件名推导并写入（仍可与 static name 组合用于 Commander 注册键）
    if (!module.key) module.key = getKey(fn, 'cmd');

    // 注册命令
    CommandProgram.use(module, module.force);
  } catch (error) {
    // 外部工作目录里的命令文件可能依赖其自身的运行环境（依赖未装、模块格式不兼容等）。
    // 这里降级为 warn，避免单个命令文件导致整个 CLI（包括 --help）无法启动。
    log.warn(
      `加载命令文件 "${fn}" 时出错`,
      error instanceof Error ? error.message : String(error)
    );
  }
};

/**
 * 扫描工作区、注册动态命令/插件并运行 Commander 解析流程。
 * @returns 解析与命令体执行完成时 settled 的 Promise
 * @description
 * 顺序：`traversaDirectory` 收集待加载模块 → `Promise.all` 并发 `import()` → `initBuiltIn(CommandProgram)` → `CommandProgram.run()`。
 * 本函数由本文件顶层 `void runjShow().catch(...)` 调用；包根 `index` 不导出本符号，以免误 import 即启动 CLI。
 */
export const runjShow = async (): Promise<void> => {
  const log = logger.fork({ namespace: 'initialize' });

  const pluginPromises: Promise<void>[] = [];
  const commandPromises: Promise<void>[] = [];

  log.debug(`cli version: ${CommandProgram.version}`);

  await traversaDirectory(
    process.cwd(),
    fn => {
      // 扫描阶段只收集 Promise，统一 await，避免边遍历边阻塞目录树
      if (fn.endsWith('.plugin.ts') || fn.endsWith('.plugin.js')) {
        pluginPromises.push(loadPlugin(fn, log));
        return;
      }

      if (fn.endsWith('.cmd.ts') || fn.endsWith('.cmd.js')) {
        commandPromises.push(loadCommand(fn, log));
        return;
      }
    },
    IGNORE_NAMES,
    MAX_DEPTH
  );

  log.debug(
    `found command: ${commandPromises.length}, plugin: ${pluginPromises.length}`
  );

  // 等待所有插件和命令加载完成
  if (pluginPromises.length > 0 || commandPromises.length > 0) {
    await Promise.all([...pluginPromises, ...commandPromises]);
  }

  const program = initBuiltIn(CommandProgram);
  log.debug('init built-in done');

  // 显式 `await` 具名 Promise，避免部分打包器将 `await Class.run()` 错误折叠为未等待的调用。
  const runPromise = program.run();
  await runPromise;
};

// 作为可执行入口立即启动；失败时非零退出，避免静默成功
void runjShow().catch((err: unknown) => {
  // 顶层启动失败时给出可读信息并 exit(1)，便于 CI/脚本判断
  logger.error(
    '❌ 启动失败:',
    err instanceof Error ? err.message : String(err)
  );

  process.exit(1);
});
