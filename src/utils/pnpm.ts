/**
 * @fileoverview PNPM 相关辅助函数
 * @description 封装常用的 pnpm 命令，供内置命令与外部调用复用。
 */

import path from 'node:path';

import { execSync, existsSync, readYamlSyncSafe } from './node';

/**
 * PNPM 工作区内置依赖版本前缀：以 `workspace:` 开头的依赖会在发版时跳过改写。
 */
export const PNPM_BUILT_IN_WORKSPACE = 'workspace:';

/**
 * PNPM catalog 依赖前缀：`catalog:` 或 `catalog:组名`。
 */
export const PNPM_BUILT_IN_CATALOG = 'catalog:';

/** pnpm 工作区清单文件名（优先 `.yaml`，不存在时尝试 `.yml`）。 */
export const PNPM_WORKSPACE_FILE = 'pnpm-workspace.yaml';

/**
 * 在指定目录执行 `pnpm install --no-frozen-lockfile`。
 * @param cwd - 工作目录（默认 `process.cwd()`）
 * @returns void
 * @example
 * ```ts
 * import { installPnpm } from '@jshow/cli';
 *
 * installPnpm(process.cwd());
 * ```
 */
export const installPnpm = (cwd?: string): void => {
  execSync('pnpm install --no-frozen-lockfile', { cwd });
};

/** `pnpm-workspace.yaml` 中与 catalog 相关的字段子集。 */
export interface PnpmWorkspaceYml {
  /** 默认 catalog 映射 */
  catalog?: Record<string, string>;
  /** 命名 catalog 组 */
  catalogs?: Record<string, Record<string, string>>;
}

/**
 * 将 catalog 条目写入结果对象，键为 `catalog:` 或 `catalog:组名`。
 * @internal
 */
const fillCatalog = (
  result: Record<string, Record<string, string>>,
  data: Record<string, string>,
  name: string = ''
) => {
  let obj: Record<string, string> | undefined = void 0;
  for (const [k, v] of Object.entries(data)) {
    if (typeof v !== 'string') continue;

    if (obj == null) {
      const key = `${PNPM_BUILT_IN_CATALOG}${name}`;
      result[key] = {};
      obj = result[key];
    }

    obj[k] = v;
  }
};

/**
 * 读取 pnpm-workspace.yml 中的 catalog 和 catalogs 字段，并按指定格式输出。
 * @param cwd - 工作目录（默认 process.cwd()）
 * @returns Record<string, Record<string, string>>
 * @example
 * ```ts
 * const catalogs = readPnpmCatalogs();
 * // { "catalog:": { "XX": "1.0.0" } }
 * ```
 */
export const readPnpmCatalogs = (
  cwd: string
): Record<string, Record<string, string>> => {
  let fn = path.join(cwd, PNPM_WORKSPACE_FILE);
  if (!existsSync(fn)) {
    fn = fn.replace('.yaml', '.yml');
    if (!existsSync(fn)) return {};
  }

  const yml = readYamlSyncSafe<PnpmWorkspaceYml>(fn);
  if (!yml) return {};

  const result: Record<string, Record<string, string>> = {};

  // 处理 `catalog`
  fillCatalog(result, yml.catalog ?? {});

  // 处理 `catalogs`
  for (const [name, catalog] of Object.entries(yml.catalogs ?? {})) {
    if (catalog == null) continue;
    fillCatalog(result, catalog, name);
  }

  return result;
};

/**
 * 自 `startDir` 向上查找含 `pnpm-workspace.yaml` 的 monorepo 根目录。
 * @param startDir - 起始目录
 * @param max - 最大递归深度
 * @param level - 当前递归深度
 * @returns monorepo 根绝对路径；未找到时为 `null`
 */
export const findPnpmWorkspaceRoot = (
  startDir: string,
  max: number = 3,
  level: number = 0
): string | null => {
  if (max < 0 || level >= max) return null;

  const fn = path.join(startDir, PNPM_WORKSPACE_FILE);
  if (existsSync(fn)) return startDir;

  const parent = path.dirname(startDir);
  if (parent === startDir) return null;

  return findPnpmWorkspaceRoot(parent, max, level + 1);
};
