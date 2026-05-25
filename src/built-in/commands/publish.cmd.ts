/**
 * @fileoverview `publish` 内置命令
 * @description 校验目标包、格式化 manifest（移除 devDependencies、解析 workspace/catalog 版本）并执行 `npm publish`。
 */

import path from 'node:path';

import {
  BaseCommand,
  type CommandArgs,
  type CommandContext,
  type CommandOptionsType
} from '../../command';
import { logger as loggerCli } from '../../logger';
import {
  execSync,
  existsSync,
  getWorkspacePackages,
  PACKAGE_DEPENDENCY_KEYS,
  PACKAGE_JSON_FILE,
  PNPM_BUILT_IN_CATALOG,
  PNPM_BUILT_IN_WORKSPACE,
  readJsonSync,
  readPnpmCatalogs,
  type PackageJson,
  writeJsonSync,
  findPnpmWorkspaceRoot
} from '../../utils';

const logger = loggerCli.fork({ namespace: 'publish' });

/** 参与 workspace/catalog 解析的 manifest 依赖字段（不含 devDependencies）。 */
const PUBLISH_DEPENDENCY_KEYS = PACKAGE_DEPENDENCY_KEYS.filter(
  key => key !== 'devDependencies'
);

/** 发布前解析 workspace / catalog 版本所需的上下文。 */
interface PublishVersionContext {
  /** 工作区内包名 → 版本 */
  versions: Record<string, string>;
  /** catalog 前缀 → 包名 → 版本 */
  catalogs: Record<string, Record<string, string>>;
}

/**
 * 将 `workspace:` / `catalog:` 协议版本解析为可发布的 semver 字符串。
 * @param depName - 依赖包名
 * @param version - manifest 中的版本声明
 * @param ctx - workspace 与 catalog 查找表
 * @returns 解析后的版本
 * @internal
 */
const resolvePublishVersion = (
  depName: string,
  version: string,
  ctx: PublishVersionContext
): string => {
  if (version.startsWith(PNPM_BUILT_IN_WORKSPACE)) {
    const wsVersion = ctx.versions[depName];
    if (!wsVersion) {
      throw new Error(`Cannot resolve workspace version for "${depName}"`);
    }

    const protocol = version.slice(PNPM_BUILT_IN_WORKSPACE.length);
    if (!protocol || protocol === '*') return wsVersion;
    if (protocol === '^') return `^${wsVersion}`;
    if (protocol === '~') return `~${wsVersion}`;

    return wsVersion;
  }

  if (version.startsWith(PNPM_BUILT_IN_CATALOG)) {
    const resolved = ctx.catalogs[version]?.[depName];
    if (!resolved) {
      throw new Error(
        `Cannot resolve catalog version for "${depName}" (${version})`
      );
    }

    return resolved;
  }

  return version;
};

/**
 * 就地改写依赖字段中的 pnpm 协议版本。
 * @param record - 依赖名 → 版本
 * @param ctx - 解析上下文
 * @internal
 */
const formatDependencyRecord = (
  record: Record<string, string> | undefined,
  ctx: PublishVersionContext
): void => {
  if (!record) return;

  for (const [name, version] of Object.entries(record)) {
    record[name] = resolvePublishVersion(name, version, ctx);
  }
};

/**
 * 构建发布用的 manifest：移除 `devDependencies` 并解析 workspace/catalog 版本。
 * @param json - 原始 `package.json`
 * @param ctx - 解析上下文
 * @returns 格式化后的 manifest 副本
 * @internal
 */
const formatPackageJsonForPublish = (
  json: PackageJson,
  ctx: PublishVersionContext
): PackageJson => {
  const next = structuredClone(json);

  delete next.devDependencies;

  for (const key of PUBLISH_DEPENDENCY_KEYS) {
    formatDependencyRecord(next[key], ctx);
  }

  formatDependencyRecord(next.pnpm?.overrides, ctx);

  return next;
};

/**
 * 收集 monorepo 内工作区包版本与 catalog 映射。
 * @param targetDir - 待发布包目录
 * @returns 发布版本解析上下文
 * @internal
 */
const buildPublishVersionContext = (
  targetDir: string
): PublishVersionContext => {
  const workspaceRoot = findPnpmWorkspaceRoot(targetDir) ?? targetDir;
  const workspacePackages = getWorkspacePackages(workspaceRoot);

  const workspaceVersions = Object.fromEntries(
    workspacePackages.map(pkg => [pkg.name, pkg.manifest.version || '0.0.0'])
  );

  return {
    versions: workspaceVersions,
    catalogs: readPnpmCatalogs(workspaceRoot)
  };
};

/**
 * 判断包名是否为 scoped（`@scope/name`）。
 * @param name - `package.json` 中的 `name`
 * @internal
 */
const isScopedPackageName = (name: string): boolean => name.startsWith('@');

/**
 * 在 `targetDir` 下写回格式化 manifest 并执行 `npm publish`（CI 场景，不恢复原始文件）。
 * @param targetDir - 包根目录
 * @param json - 原始 manifest
 * @param ctx - 版本解析上下文
 * @internal
 */
const publishPackage = (
  targetDir: string,
  json: PackageJson,
  ctx: PublishVersionContext,
  options: PublishOptions
): void => {
  const pkgFile = path.join(targetDir, PACKAGE_JSON_FILE);
  const formatted = formatPackageJsonForPublish(json, ctx);

  writeJsonSync(pkgFile, formatted);

  const cmds: string[] = ['npm publish'];

  if (isScopedPackageName(json.name)) {
    cmds.push('--access public');
  }

  if (options.provenance) {
    cmds.push('--provenance');
  }

  execSync(cmds.join(' '), { cwd: targetDir });
};

/** `publish` 命令 CLI 选项（当前无额外选项）。 */
export interface PublishOptions extends CommandOptionsType {
  /** 是否在发布时添加 provenance 信息 */
  provenance?: boolean;
}

/**
 * 将单个工作区包发布到 npm registry。
 * @example
 * ```bash
 * jshow publish
 * jshow publish ./packages/core
 * ```
 */
export class PublishCommand extends BaseCommand<PublishOptions> {
  static key = 'publish';

  public get args(): CommandArgs {
    return {
      name: 'publish',
      group: 'devOps',
      description: 'Publish the package to npm registry',
      examples: ['jshow publish', 'jshow publish ./packages/core'],
      arguments: [
        {
          name: 'input',
          description: 'The input directory'
        }
      ],
      options: [
        {
          name: 'provenance',
          abbr: 'p',
          description: 'Add provenance information to the package',
          defaultValue: false
        }
      ]
    };
  }

  /**
   * 校验目标 manifest、格式化依赖版本并执行 `npm publish`。
   * @param context - Commander 解析后的参数与选项
   * @returns Promise<void>；校验失败时 `process.exit(1)`
   */
  public async execute({
    args,
    options
  }: CommandContext<PublishOptions>): Promise<void> {
    let [inputRoot = '.'] = args;

    inputRoot = path.resolve(inputRoot);

    const cwd = process.cwd();
    const input = path.relative(cwd, inputRoot);
    logger.info('Start', { cwd, input });
    logger.empty();

    const pkgFile = path.join(inputRoot, PACKAGE_JSON_FILE);
    if (!existsSync(pkgFile)) {
      logger.error('package.json not found', { input });
      process.exit(1);
    }

    const json = readJsonSync<PackageJson>(pkgFile);
    if (!json?.name) {
      logger.error('Invalid package.json', { input });
      process.exit(1);
    }

    if (json.private) {
      logger.error('Cannot publish private package', {
        name: json.name
      });
      process.exit(1);
    }

    const ctx = buildPublishVersionContext(inputRoot);

    logger.label(`Publishing ${json.name}@${json.version}...`);

    try {
      publishPackage(inputRoot, json, ctx, options);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    logger.empty();
    logger.info('Completed');
  }
}
