/**
 * @fileoverview `backup` 内置命令
 * @description 扫描工作区包、拉取最新代码，并将包目录复制到输出目录（可选剔除 `.git`）。
 */

import path from 'node:path';

import { type Logger } from '@jshow/logger';

import {
  BaseCommand,
  type CommandArgs,
  type CommandContext,
  type CommandOptionsType
} from '../../command';
import { logger } from '../../logger';
import {
  eachDirSync,
  execSync,
  getWorkspacePackages,
  mkdirSync,
  pullCurrentBranch,
  toRegExp
} from '../../utils';

/**
 * 在根目录下解析工作区包，并按包名白名单过滤。
 * @param root - 扫描根目录（通常为输入路径参数）
 * @param filterPatterns - 非空时仅保留这些 `package.json` 的 `name` 符合正则表达式的包
 * @returns 过滤后的包信息列表
 * @internal
 */
const getInputPackages = (root: string, filterPatterns: RegExp[]) => {
  let packages = getWorkspacePackages(root);

  if (filterPatterns.length > 0) {
    packages = packages.filter(o => filterPatterns.some(p => p.test(o.name)));
  }

  return packages;
};

/**
 * 对单个包目录执行 `pullCurrentBranch`（含可选 prune）。
 * @param log - 命令作用域日志器
 * @param name - 包名（用于日志）
 * @param pkgRoot - 包根目录绝对路径
 * @returns Promise<void>
 * @internal
 */
const fetchPackage = async (log: Logger, name: string, pkgRoot: string) => {
  log.write(`Fetching package ${name} from ${pkgRoot}`);

  pullCurrentBranch(true, pkgRoot, log.checkLevel('debug'));

  log.write(`Package ${name} fetched successfully`);
};

/**
 * 将包备份到输出目录（复制包根目录下的一级内容）。
 * @param log - 命令作用域日志器
 * @param name - 包名
 * @param pkgRoot - 包根目录
 * @param outputRoot - 输出根路径
 * @param filterNames - 过滤的文件/目录名称列表
 * @returns Promise<void>
 * @internal
 */
const copyPackage = async (
  log: Logger,
  name: string,
  pkgRoot: string,
  outputRoot: string,
  filterNames: string[]
) => {
  const outputDir = path.join(outputRoot, path.dirname(pkgRoot));
  log.write('Copying package', { name, pkgRoot, outputDir });

  mkdirSync(outputDir);

  eachDirSync(pkgRoot, name => {
    if (filterNames.includes(name)) return;

    const dest = path.relative(pkgRoot, path.join(outputDir, name));

    execSync(`cp -Rf ./${name} ${dest}`, { cwd: pkgRoot });
  });

  logger.info(`Package ${name} copied successfully`);
};

/** `backup` 命令解析后的选项类型 */
interface BackupOptions extends CommandOptionsType {
  clean?: boolean;
  filter?: string;
}

/**
 * 工作区多包备份流程：先 pull，再调用占位 `backupPackage`。
 * @example
 * ```ts
 * // 该类由 CLI 自动发现并注册：文件名需以 `.cmd.ts` 结尾，且默认导出/或导出类被加载到运行时。
 *
 * // 运行示例：
 * jshow backup ./code ./code_backup
 * jshow backup ./core ./core_backup -c -f "*.test.ts"
 * ```
 */
export class BackupCommand extends BaseCommand<BackupOptions> {
  static name = 'backup';

  public get args(): CommandArgs {
    return {
      name: 'backup',
      group: 'devOps',
      description: 'Backup workspace packages to output directory',
      examples: [
        'jshow backup ./code ./code_backup',
        'jshow backup ./core ./core_backup -c -f "*.test.ts"'
      ],
      arguments: [
        {
          name: 'input',
          description: 'The input directory',
          required: true
        },
        {
          name: 'output',
          description: 'The output directory',
          defaultValue: '../backup',
          required: false
        }
      ],
      options: [
        {
          name: 'clean',
          abbr: 'c',
          description: 'Clean output .git directory',
          defaultValue: true
        },
        {
          name: 'filter',
          abbr: 'f',
          description: 'The filter pattern'
        }
      ]
    };
  }

  public async execute({
    args,
    options: { filter = '', clean = true }
  }: CommandContext<BackupOptions>): Promise<void> {
    const [inputRoot, outputRoot] = args;
    logger.info('Backup start', { inputRoot, outputRoot });

    const patterns = filter
      .split(',')
      .map(o => {
        const v = o && o.trim();
        return v ? toRegExp(v) : null;
      })
      .filter(Boolean) as RegExp[];
    const packages = getInputPackages(inputRoot, patterns);

    const filters = ['node_modules'];
    if (clean) filters.push('.git');

    for (const item of packages) {
      await logger.scope({ namespace: item.name }, async log => {
        await fetchPackage(log, item.name, item.dir);

        await copyPackage(log, item.name, item.dir, outputRoot, filters);
      });
    }

    logger.info('Backup completed');
  }
}
