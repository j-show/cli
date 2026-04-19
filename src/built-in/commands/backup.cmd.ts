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
import { logger as loggerCli } from '../../logger';
import {
  eachDirSync,
  execSync,
  existsSync,
  getGroupPackages,
  mkdirSync,
  pullCurrentBranch,
  toPatterns
} from '../../utils';

const logger = loggerCli.fork({ namespace: 'backup' });

/**
 * 在根目录下解析工作区包，并按包名白名单过滤。
 * @param root - 扫描根目录（通常为输入路径参数）
 * @param filterPatterns - 非空时仅保留这些 `package.json` 的 `name` 符合正则表达式的包
 * @returns 过滤后的包信息列表
 * @internal
 */
const getInputPackages = (root: string, filterPatterns: RegExp[]) => {
  let packages = getGroupPackages(root);

  if (filterPatterns.length > 0) {
    packages = packages.filter(o => filterPatterns.some(p => p.test(o.name)));
  }

  return packages;
};

/**
 * 对单个包目录执行 `pullCurrentBranch`（含可选 prune）。
 * @param log - 命令作用域日志器
 * @param pkgRoot - 包根目录绝对路径
 * @returns Promise<void>
 * @internal
 */
const fetchPackage = async (log: Logger, pkgRoot: string) => {
  if (!existsSync(path.join(pkgRoot, '.git'))) return;

  log.write(`Fetching path: ${path.relative(process.cwd(), pkgRoot)}`);

  pullCurrentBranch(true, pkgRoot, log.checkLevel('debug'));

  log.write(`Fetched successfully\n`);
};

/**
 * 将包备份到输出目录（复制包根目录下的一级内容）。
 * @param log - 命令作用域日志器
 * @param pkgRoot - 包根目录
 * @param outputRoot - 输出根路径
 * @param filterNames - 过滤的文件/目录名称列表
 * @returns Promise<void>
 * @internal
 */
const copyPackage = async (
  log: Logger,
  pkgRoot: string,
  outputRoot: string,
  filterNames: string[]
) => {
  const outputDir = path.join(outputRoot, path.basename(pkgRoot));

  log.write(
    `Copying path: ${path.relative(process.cwd(), pkgRoot)} to ${path.relative(process.cwd(), outputDir)}`
  );

  mkdirSync(outputDir);

  eachDirSync(pkgRoot, name => {
    if (filterNames.includes(name)) return;

    const dest = path.relative(pkgRoot, path.join(outputDir, name));

    execSync(`cp -Rf ./${name} ${dest}`, { cwd: pkgRoot });
  });

  log.write(`Copied successfully\n`);
};

/**
 * `backup` 命令解析后的选项类型。
 * @internal
 */
interface BackupOptions extends CommandOptionsType {
  /** 是否在输出侧排除 `.git` */
  clean: boolean;
  /** 逗号分隔包名过滤模式，见 {@link toPatterns} */
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
          defaultValue: '../backup'
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
    options: { clean, filter = '' }
  }: CommandContext<BackupOptions>): Promise<void> {
    let [inputRoot, outputRoot] = args;

    inputRoot = path.resolve(inputRoot);
    outputRoot = path.resolve(outputRoot);

    logger.info('Start', {
      cwd: process.cwd(),
      input: path.relative(process.cwd(), inputRoot),
      output: path.relative(process.cwd(), outputRoot)
    });
    logger.empty();

    const patterns = toPatterns(filter);
    const packages = getInputPackages(inputRoot, patterns);

    const filters = ['node_modules'];
    if (clean) filters.push('.git');

    for (const item of packages) {
      await logger.scope({ namespace: item.name }, async log => {
        await fetchPackage(log, item.dir);

        await copyPackage(log, item.dir, outputRoot, filters);
      });
    }

    logger.empty();
    logger.info('Completed');
  }
}
