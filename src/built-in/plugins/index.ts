/**
 * @fileoverview 内置插件列表
 * @description 默认可为空；非空时由 `initBuiltIn` 按优先级安装。
 */

import { type PluginClassType } from '../../plugin';

/**
 * 随 `initBuiltIn` 安装的默认插件类列表（当前为空，占位供后续内置插件）。
 */
export const BUILT_IN_PLUGINS: PluginClassType[] = [];
