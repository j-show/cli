/**
 * @fileoverview CLI 日志入口
 * @description 在模块加载时调用一次 `configure()`，再导出 fork 后的命名空间实例，供命令、程序与工具模块统一使用。
 */

import { configure, logger as jshowLogger } from '@jshow/logger';

configure();

/**
 * 供 `CommandProgram`、内置命令与 `utils` 复用的根日志器。
 * @description 子域请使用 `logger.fork({ namespace: '...' })`，避免在库内散落裸 `console`。
 */
export const logger = jshowLogger.fork({ namespace: 'jshow-cli' });
