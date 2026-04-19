/**
 * @fileoverview 文件系统与子进程封装
 * @description 提供安全的 stat、目录创建/删除、JSON 读写、同步执行命令，以及工作区包扫描。
 */

import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 同步判断路径是否存在。
 * @param ph - 文件或目录路径
 * @returns 存在则为 `true`
 * @example
 * ```ts
 * import { existsSync } from '@jshow/cli';
 *
 * if (existsSync('./package.json')) {
 *   // ...
 * }
 * ```
 */
export const existsSync = (ph: string): boolean => {
  return fs.existsSync(ph);
};

/**
 * 若路径存在则返回 `fs.statSync` 结果，否则返回 `null`（异常亦吞掉并返回 `null`）。
 * @param ph - 文件或目录路径
 * @returns `fs.Stats` 或 `null`
 * @example
 * ```ts
 * import { statSync } from '@jshow/cli';
 *
 * if (statSync('./package.json')) {
 *   // exists
 * }
 * ```
 */
export const statSync = (ph: string): fs.Stats | null => {
  try {
    if (!existsSync(ph)) return null;
    return fs.statSync(ph);
  } catch {
    return null;
  }
};

/**
 * 若路径存在则 `chmodSync`，否则不操作。
 * @param ph - 文件或目录路径
 * @param mode - 数字或八进制字符串权限
 * @returns void
 * @example
 * ```ts
 * import { chmodSync } from '@jshow/cli';
 *
 * chmodSync('./bin/cli.mjs', 0o755);
 * ```
 */
export const chmodSync = (ph: string, mode: number | string): void => {
  if (!existsSync(ph)) return;

  fs.chmodSync(ph, mode);
};

/**
 * 遍历 `root` 目录下的一级子项（不递归）。
 *
 * @param root - 目录路径
 * @param callback - 回调；显式 `return false` 可提前终止遍历
 * @param ignores - 要忽略的条目类型（默认忽略符号链接）
 * @returns void
 *
 * @description
 * - `ignores` 包含 `'dir'` 时会跳过目录
 * - `ignores` 包含 `'file'` 时会跳过普通文件与符号链接
 * - `ignores` 包含 `'link'` 时会跳过符号链接
 *
 * @example
 * ```ts
 * eachDirSync(process.cwd(), (name, ph, stat) => {
 *   if (stat.isDirectory()) console.log('dir:', name);
 * }, ['link']);
 * ```
 */
export const eachDirSync = (
  root: string,
  callback: (name: string, ph: string, stat: fs.Stats) => boolean | void,
  ignores: Array<'link' | 'dir' | 'file'> = ['link']
) => {
  const list = fs.readdirSync(root);

  for (const item of list) {
    const ph = path.join(root, item);
    const stat = statSync(ph);
    if (!stat) continue;

    if (ignores.includes('dir')) {
      if (stat.isDirectory()) continue;
    }

    if (ignores.includes('file')) {
      if (stat.isFile() || stat.isSymbolicLink()) continue;
    }

    if (ignores.includes('link')) {
      if (stat.isSymbolicLink()) continue;
    }

    if (callback(item, ph, stat) === false) return;
  }
};

/**
 * 递归创建目录（若已存在则直接返回）。
 * @param ph - 目标目录路径
 * @param mode - 可选 Unix 权限位
 * @returns void
 * @example
 * ```ts
 * import { mkdirSync } from '@jshow/cli';
 *
 * mkdirSync('./dist');
 * ```
 */
export const mkdirSync = (ph: string, mode?: number): void => {
  if (existsSync(ph)) return;

  fs.mkdirSync(ph, { recursive: true, mode });
};

/**
 * 若路径存在则递归强制删除，否则忽略；删除失败时静默忽略。
 * @param ph - 文件或目录路径
 * @returns void
 * @example
 * ```ts
 * import { rmSync } from '@jshow/cli';
 *
 * rmSync('./out');
 * ```
 */
export const rmSync = (ph: string) => {
  if (!existsSync(ph)) return;

  fs.rmSync(ph, { recursive: true, force: true });
};

/**
 * 递归复制目录或文件到目标位置（若源不存在则忽略）。
 * @param src - 源路径
 * @param dest - 目标路径
 * @returns void
 * @example
 * ```ts
 * import { cpSync } from '@jshow/cli';
 *
 * cpSync('./templates', './tmp/templates');
 * ```
 */
export const cpSync = (src: string, dest: string) => {
  if (!existsSync(src)) return;

  fs.cpSync(src, dest, { recursive: true, force: true });
};

/**
 * 移动（以“拷贝 + 删除”的方式实现）到目标位置（若源不存在则忽略）。
 * @param src - 源路径
 * @param dest - 目标路径
 * @description
 * 这里不直接使用 `fs.renameSync`，以避免跨设备移动时失败。
 * @returns void
 * @example
 * ```ts
 * import { mvSync } from '@jshow/cli';
 *
 * mvSync('./tmp/a.txt', './tmp/b.txt');
 * ```
 */
export const mvSync = (src: string, dest: string) => {
  if (!existsSync(src)) return;

  rmSync(dest);
  cpSync(src, dest);
  rmSync(src);
};

/**
 * 以 UTF-8 写入文本文件；`data` 会按行合并。
 * @param ph - 文件路径
 * @param data - 片段（字符串或字符串数组），会被 `\\n` 拼接
 * @returns void
 * @example
 * ```ts
 * import { writeFileSync } from '@jshow/cli';
 *
 * writeFileSync('./CHANGELOG.md', '# Changelog', '', '- init');
 * ```
 */
export const writeFileSync = (
  ph: string,
  ...data: Array<string | string[]>
) => {
  fs.writeFileSync(ph, data.flat().join('\n'), 'utf-8');
};

/**
 * 同步读取 UTF-8 JSON 文件并解析为泛型 `T`。
 * @param ph - JSON 文件路径
 * @typeParam T - 期望的结构类型
 * @returns 解析后的 JSON 对象
 * @example
 * ```ts
 * import { readJsonSync, type PackageJson } from '@jshow/cli';
 *
 * const pkg = readJsonSync<PackageJson>('./package.json');
 * console.log(pkg.name);
 * ```
 */
export const readJsonSync = <T>(ph: string): T | null => {
  if (!existsSync(ph)) return null;

  const data = fs.readFileSync(ph);
  return JSON.parse(data.toString('utf-8')) as T;
};

/**
 * 将对象格式化为缩进 2 空格的 JSON 并同步写入文件。
 * @param ph - 目标文件路径
 * @param data - 可序列化的数据
 * @returns void
 * @example
 * ```ts
 * import { writeJsonSync } from '@jshow/cli';
 *
 * writeJsonSync('./tmp.json', { ok: true });
 * ```
 */
export const writeJsonSync = <T>(ph: string, data: T): void => {
  fs.writeFileSync(ph, JSON.stringify(data, null, 2));
};

/**
 * {@link execSync} 的选项类型。
 * @description 在 Node 的 `cp.execSync` 基础上补充了 `verbose/silent` 以控制输出策略。
 */
export interface ExecSyncOptions extends Pick<
  cp.ExecSyncOptions,
  'cwd' | 'env' | 'stdio' | 'timeout' | 'encoding'
> {
  verbose?: boolean | undefined;
  silent?: boolean | undefined;
}

/**
 * 同步执行 shell 命令，返回去除首尾空白的 stdout 字符串。
 * @param command - 要执行的命令行
 * @param options - 可选 `cwd`、`env`、`timeout`、`encoding`
 * @returns stdout（trim 后）；`silent` 时返回空字符串
 * @example
 * ```ts
 * import { execSync } from '@jshow/cli';
 *
 * const branch = execSync('git rev-parse --abbrev-ref HEAD');
 * execSync('pnpm -v', { cwd: './packages/a', verbose: true });
 * ```
 */
export const execSync = (
  command: string,
  { verbose = false, silent = false, ...options }: ExecSyncOptions = {}
) => {
  const opts: cp.ExecSyncOptions = {
    encoding: 'utf-8',
    ...options
  };

  // 默认需要读取 stdout（很多工具函数依赖返回值）；verbose 时继承子进程 stdio
  if (opts.stdio == null) {
    if (silent) opts.stdio = 'ignore';
    else if (verbose) opts.stdio = 'inherit';
    else opts.stdio = 'pipe';
  }

  const stdout = cp.execSync(command, opts);

  return stdout ? stdout.toString().trim() : '';
};

/** 工作区识别与读写时使用的 manifest 文件名 */
export const PACKAGE_JSON_FILE = 'package.json';

/**
 * `package.json` 的最小结构（工具函数使用到的字段子集）。
 * @description 仅覆盖发版/依赖扫描相关字段，并非完整 npm 包定义。
 */
export interface PackageJson {
  /** 包名 */
  name: string;
  /** 当前版本 */
  version: string;
  /** 是否为私有包（私有根常作为 monorepo 聚合包） */
  private?: boolean;
  /** 作用域等元信息（部分场景会写入） */
  scope?: string;
  /** npm scripts */
  scripts?: Record<string, string>;
  /** 生产依赖 */
  dependencies?: Record<string, string>;
  /** 开发依赖 */
  devDependencies?: Record<string, string>;
  /** 同级依赖 */
  peerDependencies?: Record<string, string>;
  /** 可选依赖 */
  optionalDependencies?: Record<string, string>;
  /** pnpm 专有字段（如 overrides） */
  pnpm?: {
    overrides?: Record<string, string>;
  };
}

/**
 * 参与依赖扫描/改写的 `package.json` 顶层字段联合。
 * @description 排除 `optionalDependencies`：默认批量 bump 不触碰可选依赖，降低误改风险。
 */
export type PackageJsonKey = keyof Pick<
  PackageJson,
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies'
  | 'pnpm'
>;

/**
 * 依赖字段 key 列表（用于批量扫描/改写依赖版本）。
 * @example
 * ```ts
 * import { PACKAGE_DEPENDENCY_KEYS } from '@jshow/cli';
 *
 * // ['dependencies', 'devDependencies', 'peerDependencies']
 * console.log(PACKAGE_DEPENDENCY_KEYS);
 * ```
 */
export const PACKAGE_DEPENDENCY_KEYS = [
  'dependencies',
  'devDependencies',
  'peerDependencies'
] as const;

/**
 * 工作区扫描得到的单个包信息。
 * @description `dir` 一般为含 `package.json` 的目录绝对路径。
 */
export interface PackageInfo {
  /** 包根目录（绝对路径） */
  dir: string;
  /** `manifest.name` */
  name: string;
  /** 解析后的 `package.json` */
  manifest: PackageJson;
}

/**
 * 私有根（monorepo）包及其子包聚合。
 * @description `children` 由 `getWorkspacePackages` 在根目录为 `private` 时填充。
 */
export interface PackageGroup extends PackageInfo {
  /** 工作区内子包列表；非 monorepo 时为空数组 */
  children: PackageInfo[];
}

/** 扫描时跳过的目录名（点目录由 `isIgnoreDir` 另行过滤） */
const IGNORE_DIRS = ['dist', 'node_modules'];

/**
 * 是否忽略目录名（以 `.` 开头或为 `node_modules`/`dist`）。
 * @param dir - 目录名（非路径）
 * @returns 是否应跳过
 * @example
 * ```ts
 * import { isIgnoreDir } from '@jshow/cli';
 *
 * isIgnoreDir('node_modules'); // true
 * isIgnoreDir('.git'); // true
 * isIgnoreDir('packages'); // false
 * ```
 */
export const isIgnoreDir = (dir: string): boolean => {
  return dir.startsWith('.') || IGNORE_DIRS.includes(dir);
};

/**
 * 读取 `package.json` 并写入扫描列表；缺少 `name` 则跳过。
 * @param packages - 结果聚合数组（就地修改）
 * @param fn - `package.json` 绝对或相对路径
 * @returns 成功解析时返回 `PackageInfo`，否则 `null`
 * @internal
 */
const fillPackage = (packages: PackageInfo[], fn: string) => {
  const manifest = readJsonSync<PackageJson>(fn);
  if (!manifest?.name) return null;

  const info: PackageInfo = {
    dir: path.dirname(fn),
    name: manifest.name,
    manifest
  };
  packages.push(info);

  return info;
};

/**
 * 自 `root` 起递归查找含 `package.json` 的子目录，收集 `name` 非空的包列表。
 * @param root - 扫描根目录，默认 `process.cwd()`
 * @param max - 最大递归深度
 * @param level - 当前递归深度（内部递归用，调用方通常省略）
 * @param packages - 累积结果（内部递归用，调用方通常省略）
 * @returns 每个条目含目录绝对路径、包名与解析后的 manifest
 * @example
 * ```ts
 * import { getWorkspacePackages } from '@jshow/cli';
 *
 * const pkgs = getWorkspacePackages(process.cwd());
 * console.log(pkgs.map(p => p.name));
 * ```
 */
export const getWorkspacePackages = (
  root = process.cwd(),
  max = 2,
  level = 0,
  packages: PackageInfo[] = []
) => {
  if (!existsSync(root)) return packages;

  eachDirSync(
    root,
    (name, dir) => {
      const fn = path.join(dir, PACKAGE_JSON_FILE);

      if (!existsSync(fn)) {
        if (!isIgnoreDir(name) && level < max) {
          getWorkspacePackages(dir, max, level + 1, packages);
        }

        return;
      }

      fillPackage(packages, fn);
    },
    ['file']
  );

  return packages;
};

/**
 * 扫描并归类「独立包」与「monorepo 根」。
 *
 * @description
 * - 若 `root` 下存在 `package.json` 且 `private: true`，则将工作区内子包填入该根的 `children`
 * - 否则在一级子目录上继续递归（用于多仓并列的工作区布局）
 *
 * @param root - 扫描根目录，默认 `process.cwd()`
 * @param max - 最大递归深度
 * @param level - 当前递归深度（内部用）
 * @param packages - 聚合结果（内部用）
 * @returns `PackageGroup[]`，每项要么为单包，要么为带子包的 monorepo 根
 * @example
 * ```ts
 * import { getGroupPackages } from '@jshow/cli';
 *
 * const groups = getGroupPackages(process.cwd());
 * for (const g of groups) {
 *   console.log(g.name, g.children.length);
 * }
 * ```
 */
export const getGroupPackages = (
  root = process.cwd(),
  max = 3,
  level = 0,
  packages: PackageGroup[] = []
) => {
  if (!existsSync(root)) return packages;

  const pkg = fillPackage(packages, path.join(root, PACKAGE_JSON_FILE));

  if (pkg) {
    const group = pkg as PackageGroup;
    group.children = [];

    if (pkg.manifest.private) {
      group.children = getWorkspacePackages(root);
    }

    return packages;
  }

  eachDirSync(
    root,
    (name, dir) => {
      if (isIgnoreDir(name)) return;
      if (level >= max) return;

      getGroupPackages(dir, max, level + 1, packages);
    },
    ['file']
  );

  return packages;
};

/**
 * 将 `getGroupPackages` 结果拆分为「独立包列表」与「monorepo 根列表」。
 * @param packages - `getGroupPackages` 的返回值
 * @returns `[multiPackages, monorepoRoots]`：`children` 非空视为 monorepo 根
 * @example
 * ```ts
 * import { getGroupPackages, separateGroupPackages } from '@jshow/cli';
 *
 * const [singles, monos] = separateGroupPackages(getGroupPackages('.'));
 * ```
 */
export const separateGroupPackages = (
  packages: PackageGroup[]
): [PackageInfo[], PackageGroup[]] => {
  const multiPackages: PackageInfo[] = [];
  const monorepoPackages: PackageGroup[] = [];

  for (const pkg of packages) {
    if (pkg.children.length > 0) {
      monorepoPackages.push(pkg);
    } else {
      multiPackages.push(pkg);
    }
  }

  return [multiPackages, monorepoPackages];
};
