/**
 * @fileoverview `release` 内置命令
 * @description 交互选择待发布包、可选校验 Git 干净程度；写入新版本、`pnpm install`、提交并按需 `git push`（多仓 / monorepo 分支流程见实现）。
 */

import path from 'node:path';

import { type Logger } from '@jshow/logger';

import semver, { type ReleaseType } from 'semver';

import {
  BaseCommand,
  type CommandArgs,
  type CommandContext,
  type CommandOptionsType
} from '../../command';
import { logger as loggerCli } from '../../logger';
import {
  addGit,
  commitGit,
  execSync,
  getGroupPackages,
  getInquirer,
  getUnCommittedFiles,
  installPnpm,
  PACKAGE_DEPENDENCY_KEYS,
  PACKAGE_JSON_FILE,
  type PackageGroup,
  type PackageInfo,
  type PackageJson,
  PNPM_BUILT_IN_WORKSPACE,
  pushGit,
  readJsonSync,
  resetGit,
  separateGroupPackages,
  statSync,
  writeJsonSync
} from '../../utils';

const logger = loggerCli.fork({ namespace: 'release' });

/** semver 常用的三类正式版本递增类型（交互列表的基础选项） */
const RELEASE_TYPES: ReleaseType[] = ['major', 'minor', 'patch'];

/**
 * 将任意输入转换为合法的 `ReleaseType`；不合法则返回 `undefined`。
 * @param value - CLI 传入的字符串类型（如 `major` / `minor` / `patch`）
 * @returns 合法的 release type
 * @internal
 */
const convertReleaseType = (value?: string): ReleaseType | undefined => {
  if (
    typeof value !== 'string' ||
    !RELEASE_TYPES.includes(value as ReleaseType)
  ) {
    return void 0;
  }

  return value as ReleaseType;
};

/**
 * 根据当前版本推断 prerelease 标识符，并扩展 `semver.inc` 可用类型。
 * @param value - 当前版本号
 * @returns `[identifier, types]`：`identifier` 取自 `semver.prerelease` 首段；无 prerelease 时可用 `types` 仅含 `major|minor|patch`
 * @description
 * 若当前为 `1.0.0-alpha.0` 这类预发版，会额外提供 `premajor` 等类型，保证 `semver.inc` 与预发标签一致。
 * @internal
 */
const getPrereleaseIdentifier = (value: string): [string, ReleaseType[]] => {
  const types = [...RELEASE_TYPES];

  const version = String(semver.prerelease(value)?.[0] || '');

  if (version) types.push('premajor', 'preminor', 'prepatch', 'prerelease');

  return [(version || void 0) as string, types];
};

/**
 * 检查 monorepo 根目录工作区是否干净；有未提交变更则失败并提示先提交/暂存。
 * @param log - 当前作用域日志
 * @param cwd - 仓库根目录
 * @returns 可继续发版则为 `true`
 * @internal
 */
const checkPackageUncommittedForMonorepo = async (log: Logger, cwd: string) => {
  const files = getUnCommittedFiles(cwd);
  if (files.length < 1) return true;

  log.error("Repository isn't clean, commit or stash those changes first");

  return false;
};

/**
 * 针对「多仓库并列」场景检查每个待发包目录；不干净时弹出交互（跳过/重置/忽略/中止）。
 * @param log - 作用域日志
 * @param packages - 待检查包列表（可能被就地修改）
 * @returns 可继续发版为 `true`；用户选择 abort 为 `false`
 * @description `packages` 可能被就地剔除（skip）或对部分目录执行 {@link resetGit}。
 * @internal
 */
const checkPackageUncommittedForMulti = async (
  log: Logger,
  packages: PackageInfo[]
) => {
  const indexs: number[] = [];

  for (let i = 0; i < packages.length; i++) {
    const pkg = packages[i];
    if (pkg.manifest.private) continue;

    const files = getUnCommittedFiles(pkg.dir);
    if (files.length < 1) continue;

    indexs.push(i);
  }

  const inquirer = await getInquirer();
  const { select } = await inquirer.prompt<{ select: string }>({
    type: 'rawlist',
    name: 'select',
    message: [
      'The packages are not committed, how to do?',
      ...indexs.map(i => {
        const pkg = packages[i];
        return `- ${pkg.name}: ${pkg.manifest.version}`;
      }),
      ''
    ].join('\n'),
    choices: [
      { name: 'Skip these packages', value: 'skip' },
      { name: 'Reset the unsubmitted changes', value: 'reset' },
      { name: 'Ignore', value: 'ignore' },
      { name: 'Abort', value: 'abort' }
    ],
    default: 'skip'
  });

  switch (select) {
    case 'skip':
    default: {
      // 就地替换数组，调用方持有的 `packages` 引用仍有效
      const list = packages.filter((_, i) => !indexs.includes(i));
      packages.splice(0, packages.length, ...list);
      break;
    }
    case 'reset': {
      const list = packages.filter((_, i) => indexs.includes(i));
      for (const pkg of list) resetGit(pkg.dir);
      break;
    }
    case 'ignore':
      break;
    case 'abort':
      log.error('Abort the release');
      return false;
  }

  return true;
};

/**
 * 过滤非 private 的包并交由用户多选，返回选中的包列表。
 * @param list - 扫描的包列表
 * @returns 选中的包列表（可能为空数组）
 * @internal
 */
const filterReleasePackages = async (list: PackageInfo[]) => {
  const packages = list.filter(v => !v.manifest.private);
  if (packages.length < 1) return [];

  const inquirer = await getInquirer();
  const { selecteds } = await inquirer.prompt<{ selecteds: string[] }>({
    type: 'checkbox',
    name: 'selecteds',
    message: 'Select the packages to release',
    choices: packages.map(o => o.name)
  });

  return packages.filter(o => selecteds.includes(o.name));
};

/**
 * 交互式询问单个包的下一个版本号。
 * @param log - 日志（校验失败等）
 * @param packageName - 包名（用于提示）
 * @param currVersion - 当前版本
 * @param releaseType - 预选 release type（无法计算时会进入交互选择）
 * @returns 下一个合法版本号，或 `null`（取消/非法输入）
 * @internal
 */
const askForNextVersion = async (
  log: Logger,
  packageName: string,
  currVersion: string,
  releaseType?: ReleaseType
) => {
  const [preReleaseIdentifier, releaseTypes] =
    getPrereleaseIdentifier(currVersion);

  let nextVersion: string | null = null;

  if (releaseType) {
    nextVersion = semver.inc(currVersion, releaseType, preReleaseIdentifier);
    if (nextVersion) return nextVersion;
  }

  const inquirer = await getInquirer();
  nextVersion = (
    await inquirer.prompt<{ version: string }>({
      type: 'rawlist',
      name: 'version',
      message: `Select release type for ${packageName}`,
      choices: releaseTypes
        .map(type => {
          // 列表展示 bump 预览，便于用户对比当前版与候选下一版
          const value = semver.inc(currVersion, type, preReleaseIdentifier);

          return {
            name: `${type} (${currVersion} ==> ${value})`,
            value
          };
        })
        .concat({
          name: 'custom',
          value: 'custom'
        }),
      default: semver.inc(
        currVersion,
        preReleaseIdentifier ? 'prepatch' : 'patch',
        preReleaseIdentifier
      )
    })
  ).version;

  if (nextVersion === 'custom') {
    nextVersion = (
      await inquirer.prompt<{ version: string }>({
        type: 'input',
        name: 'version',
        message: `Enter the custom version for ${packageName}`,
        default: semver.inc(currVersion, 'patch', preReleaseIdentifier)
      })
    ).version;

    if (!nextVersion) {
      log.error(`No version input`);
      return null;
    }
  }

  if (!semver.valid(nextVersion)) {
    log.error(`Invalid version: ${nextVersion}`);
    return null;
  }

  log.empty();

  return nextVersion;
};

/**
 * 单个包的版本变更信息。
 * @internal
 */
interface VersionInfo {
  /** 包目录 */
  dir: string;
  /** 变更前版本 */
  old: string;
  /** 变更后版本 */
  new: string;
}

/**
 * 交互或按 `releaseType` 预选，为每个包计算下一版本号。
 * @param log - 作用域日志
 * @param packages - 待发布的包列表
 * @param releaseType - 预选 release type
 * @returns 包名到版本信息映射；用户取消时返回 `null`
 * @internal
 */
const getNewVersions = async (
  log: Logger,
  packages: PackageInfo[],
  releaseType?: ReleaseType
) => {
  const versions: Record<string, VersionInfo> = {};

  for (const { dir, name, manifest } of packages) {
    const info: VersionInfo = {
      dir,
      old: manifest.version || '0.0.0',
      new: ''
    };

    const ver = await askForNextVersion(log, name, info.old, releaseType);
    if (!ver) return null;

    info.new = ver;
    versions[name] = info;
  }

  return versions;
};

/**
 * 若包内存在 `scripts.updateVersion:post`，则执行该脚本做自定义收尾。
 * @param json - 包 manifest
 * @param dir - 包目录或 package.json 路径
 * @returns void
 * @internal
 */
const execUpdateVersionPost = (json: PackageJson, dir: string): void => {
  const postScript = json.scripts?.['updateVersion:post'];
  if (!postScript) return;

  try {
    let cwd = dir;
    if (!statSync(cwd)?.isDirectory()) cwd = path.dirname(cwd);

    execSync('pnpm updateVersion:post', { cwd });
  } catch {
    logger.error(`run updateVersion:post fail, scripts: ${postScript}`);
  }
};

/**
 * 将 `versions` 写入各包 `package.json`，并同步更新依赖版本引用。
 * @param versions - 包名到版本信息映射
 * @returns Promise<void>
 * @internal
 */
const updateVersions = async (versions: Record<string, VersionInfo>) => {
  await Promise.all(
    Object.values(versions).map(async pkg => {
      // 各包 manifest 独立写回；依赖字段里若引用同批 bump 的包名则同步到新版本
      const fn = path.join(pkg.dir, PACKAGE_JSON_FILE);

      const json = readJsonSync<PackageJson>(fn);
      if (!json) return;

      json.version = pkg.new;

      for (const type of PACKAGE_DEPENDENCY_KEYS) {
        const items = json[type] ?? {};

        for (const key of Object.keys(items)) {
          // skip workspace:* / workspace:^...
          if (items[key].startsWith(PNPM_BUILT_IN_WORKSPACE)) continue;

          if (versions[key]) {
            items[key] = versions[key].new;
          }
        }
      }

      writeJsonSync(fn, json);

      execUpdateVersionPost(json, pkg.dir);
    })
  );
};

/**
 * Monorepo 根目录下发版：确认、bump、`pnpm install`、提交并按需推送。
 * @param log - 日志
 * @param cwd - monorepo 根目录
 * @param versions - 选中包名到新版本的映射
 * @param force - 跳过交互确认
 * @param push - 是否在末尾执行 `git push`
 * @returns Promise<void>
 * @description 函数名沿用历史拼写 `Monrepo`，语义等价 monorepo。
 * @internal
 */
const releasePackageForMonrepo = async (
  log: Logger,
  cwd: string,
  versions: Record<string, VersionInfo>,
  force: boolean,
  push: boolean
) => {
  if (!force) {
    const inquirer = await getInquirer();
    const yes = (
      await inquirer.prompt({
        type: 'confirm',
        name: 'value',
        message: [
          'Confirm:',
          ...Object.entries(versions).map(
            ([name, ver]) => `${name}: ${ver.old} => ${ver.new}`
          ),
          ''
        ].join('\n')
      })
    ).value;
    if (!yes) return;

    log.empty();
  }

  log.step('Update version...');
  await updateVersions(versions);

  log.step('Install dependencies...');
  installPnpm(cwd);

  if (getUnCommittedFiles(cwd).length < 1) {
    log.error('No uncommitted changes');
    return;
  }

  log.step('Committing...');
  addGit(cwd);

  commitGit(
    [
      'chore: release packages',
      '',
      ...Object.entries(versions).map(([name, ver]) => `- ${name} ${ver.new}`)
    ],
    cwd
  );

  if (push) {
    log.step('Pushing...');
    pushGit(cwd);
  }
};

/**
 * 多独立包场景：可对选中包逐一安装、提交并推送。
 * @param log - 作用域日志
 * @param data - 包名到新版本映射（含目录路径）
 * @param force - 为真时跳过二次勾选，发布全部条目
 * @param push - 是否在每包提交后 `git push`
 * @returns Promise<void>
 * @internal
 */
const releasePackageForMulti = async (
  log: Logger,
  data: Record<string, VersionInfo>,
  force: boolean,
  push: boolean
) => {
  const versions: Record<string, VersionInfo> = {};

  if (force) {
    for (const key of Object.keys(data)) {
      versions[key] = data[key];
    }
  } else {
    const inquirer = await getInquirer();
    const { selecteds } = await inquirer.prompt<{ selecteds: string[] }>({
      type: 'checkbox',
      name: 'selecteds',
      message: 'Select the package to release',
      choices: Object.entries(data).map(([name, ver]) => ({
        name: `${name}: ${ver.old} => ${ver.new}`,
        value: name
      })),
      default: Object.keys(data)
    });

    if (selecteds.length < 1) return;

    for (const key of selecteds) {
      versions[key] = data[key];
    }

    log.empty();
  }

  log.step('Update version...');
  await updateVersions(versions);

  log.empty();
  for (const [name, ver] of Object.entries(versions)) {
    await log.scope({ namespace: name }, async clog => {
      // 多仓场景每个包在各自 Git 根下 install/commit/push
      const cwd = ver.dir;

      clog.step('Install dependencies...');
      installPnpm(cwd);

      if (getUnCommittedFiles(cwd).length < 1) {
        clog.error('No uncommitted changes');
        return;
      }

      clog.step('Committing...');
      addGit(cwd);

      commitGit([`chore: release package ${ver.new}`], cwd);

      if (push) {
        clog.step('Pushing...');
        pushGit(cwd);
      }
    });
  }
};

/**
 * 处理「多个并列独立包」发版入口：校验、过滤交互、计算版本并调用 {@link releasePackageForMulti}。
 * @param log - 作用域日志
 * @param packages - 扫描得到的独立包列表
 * @param options - CLI 选项（`check` / `type` / `force` / `push`）
 * @returns 流程成功为 `true`，跳过/取消/无包为 `false`
 * @internal
 */
const releaseMultiPackages = async (
  log: Logger,
  packages: PackageInfo[],
  { check, type, force, push }: ReleaseOptions
) => {
  if (check) {
    const status = await checkPackageUncommittedForMulti(log, packages);
    if (!status) return false;
  }

  const selected = await filterReleasePackages(packages);
  if (selected.length === 0) {
    log.warn('No packages to release');
    return false;
  }

  log.empty();
  log.label('Will bump:');
  log.label(
    selected.map(o => `    ${o.name} ${o.manifest.version}`).join('\n')
  );
  log.empty();

  const versions = await getNewVersions(
    log,
    selected,
    convertReleaseType(type)
  );
  if (!versions) return false;

  await releasePackageForMulti(log, versions, !!force, !!push);

  return true;
};

/**
 * 处理单个 monorepo 根（含 `children`）的发版入口。
 * @param log - 作用域日志
 * @param group - monorepo 根目录与子包列表
 * @param options - CLI 选项（`check` / `type` / `force` / `push`）
 * @returns 流程成功为 `true`，否则 `false`
 * @internal
 */
const releaseMonrepoPackage = async (
  log: Logger,
  { dir, children }: PackageGroup,
  { check, type, force, push }: ReleaseOptions
) => {
  if (check) {
    const status = await checkPackageUncommittedForMonorepo(log, dir);
    if (!status) return false;
  }

  const selected = await filterReleasePackages(children);
  if (selected.length === 0) {
    log.warn('No packages to release');
    return false;
  }

  log.empty();
  log.label('Will bump:');
  log.label(
    selected.map(o => `    ${o.name} ${o.manifest.version}`).join('\n')
  );
  log.empty();

  const versions = await getNewVersions(
    log,
    selected,
    convertReleaseType(type)
  );
  if (!versions) return false;

  await releasePackageForMonrepo(log, dir, versions, !!force, !!push);

  return true;
};

/**
 * `release` 命令解析后的选项类型。
 * @internal
 */
interface ReleaseOptions extends CommandOptionsType {
  /** 发版前是否检查工作区干净 */
  check: boolean;
  /** 预选 `semver` release type（如 `patch`） */
  type?: string;
  /** 是否跳过确认提示 */
  force: boolean;
  /** 是否在提交后 `git push` */
  push: boolean;
}

/** `execute` 末尾 Report 表的行结构。 */
interface ReleaseReport {
  /** 布局类型：`multi` 或 `mono` */
  type: string;
  /** monorepo 根包名；multi 布局为 `-` */
  name: string;
  /** 处理的包数量（mono 为子包数） */
  count: number;
  /** 该段流程是否产生并成功完成升级 */
  status: boolean;
}

/**
 * 工作区发版向导：可选检查 Git 状态、选择包、`semver` bump、写回 `package.json`、`pnpm install`、提交与推送。
 * @example
 * ```ts
 * // 运行示例：
 * // jshow release
 * // jshow release --force
 * // jshow release ./packages --check
 * ```
 */
export class ReleaseCommand extends BaseCommand<ReleaseOptions> {
  static key = 'release';

  public get args(): CommandArgs {
    return {
      name: 'release',
      group: 'devOps',
      description: 'Release chore to the remote repository',
      examples: [
        'jshow release',
        'jshow release --force',
        'jshow release ./packages --check'
      ],
      arguments: [
        {
          name: 'input',
          description: 'The input directory'
        }
      ],
      options: [
        {
          name: 'check',
          abbr: 'c',
          description: 'Check the release',
          defaultValue: true
        },
        {
          name: 'type',
          abbr: 't',
          description: 'Release type mode'
        },
        {
          name: 'force',
          abbr: 'f',
          description: 'Force the release',
          defaultValue: false
        },
        {
          name: 'push',
          abbr: 'p',
          description: 'Push the release to the remote repository',
          defaultValue: true
        }
      ]
    };
  }

  public async execute({
    args,
    options
  }: CommandContext<ReleaseOptions>): Promise<void> {
    let [inputRoot = '.'] = args;

    inputRoot = path.resolve(inputRoot);

    const cwd = process.cwd();
    logger.info('Start', {
      cwd,
      input: path.relative(cwd, inputRoot)
    });
    logger.empty();

    const packages = getGroupPackages(inputRoot);
    const [multiPackages, monorepoPackages] = separateGroupPackages(packages);

    const reports: ReleaseReport[] = [];

    if (multiPackages.length > 0) {
      logger.label(`Release multi packages: ${multiPackages.length}`);

      await logger.scope({ namespace: 'multi' }, async log => {
        // 多独立仓与 monorepo 可同次执行：前者按包各自 Git 根，后者在 monorepo 根统一提交
        const status = await releaseMultiPackages(log, multiPackages, options);

        reports.push({
          type: 'multi',
          name: '-',
          count: multiPackages.length,
          status
        });
      });

      logger.label('--------------------------------');
      logger.empty();
    }

    const mpcount = monorepoPackages.length;
    if (mpcount > 0) {
      logger.label(`Release monorepo packages: ${mpcount}`);

      for (const pkg of monorepoPackages) {
        await logger.scope({ namespace: `mrepo: ${pkg.name}` }, async log => {
          const status = await releaseMonrepoPackage(log, pkg, options);

          reports.push({
            type: 'mono',
            name: pkg.name,
            count: pkg.children.length,
            status
          });
        });
        logger.empty();
      }

      logger.label('--------------------------------');
      logger.empty();
    }

    logger.label('Report:');
    logger.table(reports);
    logger.empty();

    logger.info('Completed');
  }
}
