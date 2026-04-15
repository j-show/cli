/**
 * @fileoverview 文件系统与子进程封装
 * @description 提供安全的 stat、目录创建/删除、JSON 读写、同步执行命令，以及工作区包扫描。
 */

import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 若路径存在则返回 `fs.statSync` 结果，否则返回 `null`（异常亦吞掉并返回 `null`）。
 * @param ph - 文件或目录路径
 */
export const statSync = (ph: string): fs.Stats | null => {
  try {
    if (!fs.existsSync(ph)) return null;
    return fs.statSync(ph);
  } catch {
    return null;
  }
};

/**
 * 若路径存在则 `chmodSync`，否则不操作。
 * @param ph - 文件或目录路径
 * @param mode - 数字或八进制字符串权限
 */
export const chmodSync = (ph: string, mode: number | string): void => {
  if (!fs.existsSync(ph)) return;

  fs.chmodSync(ph, mode);
};

/**
 * 遍历 `root` 目录下的一级子项（不递归）。
 *
 * @param root - 目录路径
 * @param callback - 回调；返回 `false` 可提前终止遍历
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
  callback: (name: string, ph: string, stat: fs.Stats) => false | void,
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
 */
export const mkdirSync = (ph: string, mode?: number): void => {
  if (fs.existsSync(ph)) return;

  fs.mkdirSync(ph, { recursive: true, mode });
};

/**
 * 若路径存在则递归强制删除，否则忽略；删除失败时静默忽略。
 * @param ph - 文件或目录路径
 */
export const rmSync = (ph: string) => {
  if (!fs.existsSync(ph)) return;

  fs.rmSync(ph, { recursive: true, force: true });
};

/**
 * 递归复制目录或文件到目标位置（若源不存在则忽略）。
 * @param src - 源路径
 * @param dest - 目标路径
 */
export const cpSync = (src: string, dest: string) => {
  if (!fs.existsSync(src)) return;

  fs.cpSync(src, dest, { recursive: true, force: true });
};

/**
 * 移动（以“拷贝 + 删除”的方式实现）到目标位置（若源不存在则忽略）。
 * @param src - 源路径
 * @param dest - 目标路径
 * @description
 * 这里不直接使用 `fs.renameSync`，以避免跨设备移动时失败。
 */
export const mvSync = (src: string, dest: string) => {
  if (!fs.existsSync(src)) return;

  rmSync(dest);
  cpSync(src, dest);
  rmSync(src);
};

/**
 * 以 UTF-8 写入文本文件；`data` 会按行合并。
 * @param ph - 文件路径
 * @param data - 片段（字符串或字符串数组），会被 `\\n` 拼接
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
 */
export const readJsonSync = <T>(ph: string): T => {
  const data = fs.readFileSync(ph);
  return JSON.parse(data.toString('utf-8')) as T;
};

/**
 * 将对象格式化为缩进 2 空格的 JSON 并同步写入文件。
 * @param ph - 目标文件路径
 * @param data - 可序列化的数据
 */
export const writeJsonSync = <T>(ph: string, data: T): void => {
  fs.writeFileSync(ph, JSON.stringify(data, null, 2));
};

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
 */
export const execSync = (
  command: string,
  { verbose = false, silent = false, ...options }: ExecSyncOptions = {}
) => {
  const stdout = cp.execSync(command, {
    encoding: 'utf-8',
    // 默认需要读取 stdout（很多工具函数依赖返回值）；verbose 时直接继承输出
    stdio: silent ? 'ignore' : verbose ? 'inherit' : 'pipe',
    ...options
  });

  return stdout ? stdout.toString().trim() : '';
};

export interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  pnpm?: {
    overrides?: Record<string, string>;
  };
}

export const PACKAGE_DEPENDENCY_KEYS = [
  'dependencies',
  'devDependencies',
  'peerDependencies'
] as const;

/** 工作区扫描得到的单个包信息 */
export interface PackageInfo {
  dir: string;
  name: string;
  manifest: PackageJson;
}

/** 扫描时跳过的目录名（不含前缀点目录的通用规则见 `isIgnoreDir`） */
const IGNORE_DIRS = ['node_modules'];

/** 是否跳过以 `.` 开头或位于 `IGNORE_DIRS` 中的目录名 */
const isIgnoreDir = (dir: string) => {
  return dir.startsWith('.') || IGNORE_DIRS.includes(dir);
};

/**
 * 自 `root` 起递归查找含 `package.json` 的子目录，收集 `name` 非空的包列表。
 * @param root - 扫描根目录，默认 `process.cwd()`
 * @param level - 当前递归深度
 * @param max - 最大递归深度
 * @param packages - 累积结果（递归用）
 * @returns 每个条目含目录绝对路径、包名与解析后的 manifest
 */
export const getWorkspacePackages = (
  root = process.cwd(),
  level = 0,
  max = 3,
  packages: PackageInfo[] = []
) => {
  if (!fs.existsSync(root)) return packages;

  eachDirSync(
    root,
    (name, dir) => {
      const fn = path.join(dir, 'package.json');

      if (!fs.existsSync(fn)) {
        if (!isIgnoreDir(name) && level < max) {
          getWorkspacePackages(dir, level + 1, max, packages);
        }

        return;
      }

      const manifest = readJsonSync<PackageJson>(fn);
      if (!manifest.name) return;

      packages.push({
        dir,
        name: manifest.name,
        manifest
      });
    },
    ['file']
  );

  return packages;
};
