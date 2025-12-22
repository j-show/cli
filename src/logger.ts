/**
 * @fileoverview CLI 日志入口
 * @description 基于 @jshow/logger 派生命名空间实例，供命令、程序与工具模块统一使用。
 */

import { logger as jshowLogger } from '@jshow/logger';

/** 绑定 `jshow-cli` 命名空间的日志器实例 */
export const logger = jshowLogger.fork({ namespace: 'jshow-cli' });
