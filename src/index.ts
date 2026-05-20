/* eslint-disable jshow/sort-export */

/**
 * @fileoverview 包入口：聚合导出 Commander、命令/插件框架、内置初始化与工具模块。
 * @description
 * - 可执行 CLI 由单独产物 `dist/cli.mjs` + `bin/cli.mjs` 启动（扫描 `process.cwd()` 下的 `.cmd` / `.plugin` 并注册内置命令）。
 * - 作为库使用时，通常组合 `CommandProgram`、`initBuiltIn` 与 `BaseCommand` / `BasePlugin`；`./utils` 子模块供发版/工作区类内置命令与上层工具复用。
 */

/**
 * 再导出 [commander](https://github.com/tj/commander.js) 的全部公开 API，便于与 `CommandProgram.program` 混用而无需额外依赖声明。
 */
export * from 'commander';

/**
 * 命令程序单例：注册命令/插件、读取包版本、运行 `parseAsync`。
 */
export { CommandProgram, initBuiltIn } from './program';

/**
 * 命令模型：`BaseCommand`、`CommandArgs`、选项/位置参数类型与 `isCommand` 守卫。
 */
export * from './command';

/**
 * 插件模型：`BasePlugin`、`isPlugin`，以及与命令对齐的生命周期钩子类型。
 */
export * from './plugin';

/**
 * 工作区扫描、Git、pnpm、路径/JSON 等工具（与内置 `release` / `backup` 等命令共享实现）。
 */
export * from './utils';

/**
 * 带 `jshow-cli` 命名空间的共享日志器（`@jshow/logger`）。
 */
export { logger } from './logger';
