/**
 * @fileoverview 内置插件列表
 * @description 默认可为空；非空时由 `initBuiltIn` 按优先级安装。
 */

import { type PluginClassType } from '../../plugin';

/** 启动时由 `initBuiltIn` 安装的插件类 */
export const BUILT_IN_PLUGINS: PluginClassType[] = [];
