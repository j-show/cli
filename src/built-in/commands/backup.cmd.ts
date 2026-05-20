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
  cpSync,
  eachDirSync,
  existsSync,
  getGroupPackages,
  isIgnoreDir,
  mkdirSync,
  pullCurrentBranch,
  toPatterns,
  type PackageGroup,
  type PackageInfo
} from '../../utils';

const logger = loggerCli.fork({ namespace: 'backup' });

/** 无 `package.json` 时扫描 `.git` 仓库的最大递归深度 */
const GIT_SCAN_MAX_DEPTH = 3;

/** Git 元数据目录名，用于判断目录是否为仓库根。 */
const GIT_DIR = '.git';

/**
 * 将 Git 仓库根目录转为备份目标条目。
 * @internal
 */
const toGitPackageInfo = (dir: string): PackageInfo => {
  const name = path.basename(dir);
  return {
    dir,
    name,
    manifest: { name, version: '0.0.0' }
  };
};

/**
 * 自 `root` 起递归查找含 `.git` 的目录，每个仓库根视为一个工作区包。
 * @description 命中 `.git` 后不再向下扫描，避免把子模块或嵌套仓重复计入。
 * @internal
 */
const discoverGitPackages = (
  root: string,
  max = GIT_SCAN_MAX_DEPTH,
  level = 0,
  packages: PackageInfo[] = []
): PackageInfo[] => {
  if (!existsSync(root)) return packages;

  if (existsSync(path.join(root, GIT_DIR))) {
    packages.push(toGitPackageInfo(root));
    return packages;
  }

  if (level >= max) return packages;

  eachDirSync(
    root,
    (name, dir) => {
      if (isIgnoreDir(name)) return;
      discoverGitPackages(dir, max, level + 1, packages);
    },
    ['file']
  );

  return packages;
};

/**
 * 将 `getGroupPackages` 结果展开为待备份的包目录列表。
 * @description monorepo 根（含 `children`）时备份各子包；无 manifest 时回退为 `.git` 仓库扫描。
 * @internal
 */
const resolveBackupTargets = (
  inputRoot: string,
  groups: PackageGroup[]
): PackageInfo[] => {
  const targets: PackageInfo[] = [];

  for (const group of groups) {
    if (group.children.length > 0) {
      targets.push(...group.children);
    } else {
      targets.push(group);
    }
  }

  if (targets.length > 0) return targets;

  return discoverGitPackages(inputRoot);
};

/**
 * 解析备份目标并按 `-f` 过滤包名。
 * @param root - 扫描根目录（用于无 manifest 时的 `.git` 回退扫描）
 * @param groups - `getGroupPackages` 结果
 * @param filterPatterns - `toPatterns` 解析后的正则列表；为空则不过滤
 * @returns 待备份的 `PackageInfo` 列表
 * @internal
 */
const getInputPackages = (
  root: string,
  groups: PackageGroup[],
  filterPatterns: RegExp[]
) => {
  let packages = resolveBackupTargets(root, groups);

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
  if (!existsSync(path.join(pkgRoot, GIT_DIR))) return;

  log.write(`Fetching path: ${path.relative(process.cwd(), pkgRoot)}`);

  try {
    pullCurrentBranch(true, pkgRoot, log.checkLevel('debug'));
    log.write(`Fetched successfully\n`);
  } catch {
    log.write(`Failed to fetch\n`);
  }
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
    // 只复制包根下一级条目，避免把整棵子树（含 node_modules）递归进备份目录
    if (filterNames.includes(name)) return;

    const src = path.join(pkgRoot, name);
    const dest = path.join(outputDir, name);
    cpSync(src, dest);
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
 * 工作区多包备份：对每个包可选 `git pull`，再将目录内容复制到输出路径（见 {@link copyPackage}）。
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
  static key = 'backup';

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

    const cwd = process.cwd();
    logger.info('Start', {
      cwd,
      input: path.relative(cwd, inputRoot),
      output: path.relative(cwd, outputRoot)
    });
    logger.empty();

    const patterns = toPatterns(filter);
    const groups = getGroupPackages(inputRoot);
    const packages = getInputPackages(inputRoot, groups, patterns);

    if (packages.length < 1) {
      logger.error('No packages found to backup', {
        input: path.relative(cwd, inputRoot),
        filter: filter || void 0
      });
      process.exit(1);
    }

    if (groups.length < 1) {
      logger.warn(
        `No package.json workspaces under "${path.relative(cwd, inputRoot)}"; backing up ${packages.length} git repository(ies).`
      );
    }

    const filters = ['node_modules'];
    if (clean) filters.push('.git');

    for (const item of packages) {
      await logger.scope({ namespace: item.name }, async log => {
        // 按包隔离 pull/copy 日志，单包失败不影响后续包
        await fetchPackage(log, item.dir);

        await copyPackage(log, item.dir, outputRoot, filters);
      });
    }

    logger.empty();
    logger.info('Completed');
  }
}
