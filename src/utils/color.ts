/**
 * @fileoverview 终端 ANSI 颜色辅助
 * @description 为 CLI 输出提供红/绿/黄高亮，不检测 TTY（由调用方决定是否着色）。
 */

/**
 * 将文本包裹为红色（ANSI 31）。
 * @param msg - 原始字符串
 * @returns 带颜色转义序列的字符串
 */
export const red = (msg: string) => `\x1b[31m${msg}\x1b[0m`;

/**
 * 将文本包裹为绿色（ANSI 32）。
 * @param msg - 原始字符串
 * @returns 带颜色转义序列的字符串
 */
export const green = (msg: string) => `\x1b[32m${msg}\x1b[0m`;

/**
 * 将文本包裹为黄色（ANSI 33）。
 * @param msg - 原始字符串
 * @returns 带颜色转义序列的字符串
 */
export const yellow = (msg: string) => `\x1b[33m${msg}\x1b[0m`;
