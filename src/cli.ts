#!/usr/bin/env ts-node-esm
/**
 * @fileoverview CLI 入口文件
 * @description 自动扫描并加载项目中的命令文件，然后运行 CLI 程序
 */

import fs from 'node:fs';
import path from 'node:path';

import { type CommandImportType, isCommand } from './command';
import { isPlugin, type PluginImportType } from './plugin';
import { CommandProgram, initBuiltIn } from './program';

/**
 * 从文件路径中提取命令名称
 * @param fn - 文件路径
 * @param key - 命令或插件
 * @returns 命令名称（去除扩展名和 .cmd | .plugin 后缀）
 * @example
 * getName('/path/to/example.cmd.ts') // 'example'
 * getName('/path/to/test.cmd.js') // 'test'
 */
const getName = (fn: string, key: 'cmd' | 'plugin'): string =>
  path.basename(fn, path.extname(fn)).replace(`.${key}`, '');

/**
 * 递归遍历目录
 * @param root - 要遍历的根目录路径
 * @param callback - 对每个匹配的文件执行的回调函数
 * @param ignore - 要忽略的文件或目录名称列表（默认：空数组）
 * @returns Promise<void>
 * @description
 * 递归遍历指定目录及其子目录，对每个以 .ts 或 .js 结尾的文件执行回调函数。
 * 可以指定要忽略的文件或目录名称。
 * @example
 * ```typescript
 * await traversaDirectory('./src', (file) => {
 *   console.log('Found file:', file);
 * }, ['node_modules', '.git']);
 * ```
 */
const traversaDirectory = async (
  root: string,
  callback: (fn: string) => void,
  ignore: string[] = []
): Promise<void> => {
  const list = fs.readdirSync(root);

  for (const item of list) {
    if (ignore.includes(item)) continue;

    const fn = path.join(root, item);
    const stat = fs.statSync(fn);

    if (stat.isDirectory()) {
      await traversaDirectory(fn, callback, ignore);
      continue;
    }

    if (!stat.isFile()) continue;
    if (!fn.endsWith('.ts') && !fn.endsWith('.js')) continue;

    await callback(fn);
  }
};

/**
 * 加载并注册插件
 * @param fn - 插件文件路径
 * @returns Promise<void>
 * @description
 * 动态导入插件文件，验证是否为有效的插件类，然后注册到 CommandProgram。
 * 支持 TypeScript (.ts) 和 JavaScript (.js) 文件。
 * 支持 ES Module 和 CommonJS 格式。
 * 如果插件类没有设置 name 属性，会从文件名自动提取。
 * 如果加载失败，会输出警告信息但不会中断程序执行。
 * @example
 * ```typescript
 * await loadPlugin('./plugins/my-plugin.plugin.ts');
 * await loadPlugin('./plugins/my-plugin.plugin.js');
 * ```
 */
const loadPlugin = async (fn: string): Promise<void> => {
  try {
    // 将相对路径转换为绝对路径，确保 import() 能正确解析
    // Node.js 的 import() 可以处理绝对路径（包括 Windows 路径）
    const absolutePath = path.isAbsolute(fn)
      ? fn
      : path.resolve(process.cwd(), fn);

    const file = (await import(absolutePath)) as
      | PluginImportType
      | { default?: unknown; [key: string]: unknown };

    // 处理 CommonJS 和 ESM 模块
    // CommonJS: module.exports = X (Node.js 会自动将其作为 default 导出)
    // ESM: export default X
    const plugin = (file.default || file) as PluginImportType['default'];

    // 检查是否为有效的插件
    if (!isPlugin(plugin)) return;

    if (!plugin.name) plugin.name = getName(fn, 'plugin');

    // 注册插件
    CommandProgram.install(plugin, plugin.force);
  } catch (error) {
    console.warn(`加载插件文件 "${fn}" 时出错:`, error);
  }
};

/**
 * 加载并注册命令
 * @param fn - 命令文件路径
 * @returns Promise<void>
 * @description
 * 动态导入命令文件，验证是否为有效的命令类，然后注册到 CommandProgram。
 * 支持 TypeScript (.ts) 和 JavaScript (.js) 文件。
 * 支持 ES Module 和 CommonJS 格式。
 * 如果命令类没有设置 name 属性，会从文件名自动提取。
 * @example
 * ```typescript
 * await loadCommand('./commands/build.cmd.ts');
 * await loadCommand('./commands/build.cmd.js');
 * ```
 */
const loadCommand = async (fn: string): Promise<void> => {
  try {
    // 将相对路径转换为绝对路径，确保 import() 能正确解析
    // Node.js 的 import() 可以处理绝对路径（包括 Windows 路径）
    const absolutePath = path.isAbsolute(fn)
      ? fn
      : path.resolve(process.cwd(), fn);

    const file = (await import(absolutePath)) as
      | CommandImportType
      | { default?: unknown; [key: string]: unknown };

    // 处理 CommonJS 和 ESM 模块
    // CommonJS: module.exports = X (Node.js 会自动将其作为 default 导出)
    // ESM: export default X
    const module = (file.default || file) as CommandImportType['default'];

    // 检查是否为有效的命令类
    if (!isCommand(module)) return;

    // 如果命令类没有设置 name 属性，从文件名提取
    if (!module.name) module.name = getName(fn, 'cmd');

    // 注册命令
    CommandProgram.use(module, module.force);
  } catch (error) {
    console.error(`加载命令文件 "${fn}" 时出错:`, error);
    throw error;
  }
};

/**
 * 运行 jShow CLI 程序
 * @returns Promise<void>
 * @description
 * 1. 从当前工作目录加载所有插件
 * 2. 安装所有已启用的插件
 * 3. 从当前工作目录加载所有命令
 * 4. 运行 CLI 程序，解析命令行参数并执行相应命令
 */
const runjShow = async (): Promise<void> => {
  const pluginPromises: Promise<void>[] = [];
  const commandPromises: Promise<void>[] = [];

  await traversaDirectory(process.cwd(), fn => {
    if (fn.endsWith('.plugin.ts') || fn.endsWith('.plugin.js')) {
      pluginPromises.push(loadPlugin(fn));
      return;
    }

    if (fn.endsWith('.cmd.ts') || fn.endsWith('.cmd.js')) {
      commandPromises.push(loadCommand(fn));
      return;
    }
  });

  // 等待所有插件和命令加载完成
  if (pluginPromises.length > 0 || commandPromises.length > 0) {
    await Promise.all([...pluginPromises, ...commandPromises]);
  }

  initBuiltIn(CommandProgram).run();
};

// 启动 CLI
runjShow();
