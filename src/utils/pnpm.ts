/**
 * @fileoverview PNPM 相关辅助函数
 * @description 封装常用的 pnpm 命令，供内置命令与外部调用复用。
 */

import { execSync } from './node';

/**
 * PNPM 工作区内置依赖版本前缀：以 `workspace:` 开头的依赖会在发版时跳过改写。
 */
export const PNPM_BUILT_IN_VERSION = 'workspace:';

/**
 * 在指定目录执行 `pnpm install --no-frozen-lockfile`。
 * @param cwd - 工作目录（默认 `process.cwd()`）
 */
export const installPnpm = (cwd?: string) => {
  execSync('pnpm install --no-frozen-lockfile', { cwd });
};
