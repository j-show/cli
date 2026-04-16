/* eslint-disable no-void */
/**
 * @fileoverview `release` 内置命令
 * @description 交互选择待发包、校验工作区干净程度；版本 bump 与发布逻辑为占位实现。
 */

import os from 'node:os';
import path from 'node:path';

import inquirer from 'inquirer';
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
  commitGitByFile,
  execSync,
  getUnCommittedFiles,
  getWorkspacePackages,
  installPnpm,
  PACKAGE_DEPENDENCY_KEYS,
  type PackageInfo,
  type PackageJson,
  PNPM_BUILT_IN_VERSION,
  pushGit,
  readJsonSync,
  statSync,
  writeFileSync,
  writeJsonSync
} from '../../utils';

const logger = loggerCli.fork({ namespace: 'release' });

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
 * 根据当前版本推断 prerelease 标识符（如 `1.0.0-alpha.0` -> `alpha`），并扩展可用 release types。
 * @param value - 当前版本号
 * @returns `[identifier, types]`：identifier 为空字符串时表示无 prerelease
 */
const getPrereleaseIdentifier = (value: string): [string, ReleaseType[]] => {
  const types = [...RELEASE_TYPES];

  const version = String(semver.prerelease(value)?.[0] || '');

  if (version) types.push('premajor', 'preminor', 'prepatch', 'prerelease');

  return [(version || void 0) as string, types];
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
 * @param packageName - 包名（用于提示）
 * @param currVersion - 当前版本
 * @param releaseType - 预选 release type（无法计算时会进入交互选择）
 * @returns 下一个合法版本号，或 `null`（取消/非法输入）
 */
const askForNextVersion = async (
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

  nextVersion = (
    await inquirer.prompt<{ version: string }>({
      type: 'rawlist',
      name: 'version',
      message: `Select release type for ${packageName}`,
      choices: releaseTypes
        .map(type => {
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
      await inquirer.prompt({
        type: 'input',
        name: 'version',
        message: `Enter the custom version for ${packageName}`,
        default: semver.inc(currVersion, 'patch', preReleaseIdentifier)
      })
    ).version;

    if (!nextVersion) {
      logger.error(`No version input`);
      return null;
    }
  }

  if (!semver.valid(nextVersion)) {
    logger.error(`Invalid version: ${nextVersion}`);
    return null;
  }

  logger.empty();

  return nextVersion;
};

/**
 * 单个包的版本变更信息。
 */
interface VersionInfo {
  dir: string;
  old: string;
  new: string;
}

/**
 * 计算每个包的新版本号（当前返回空对象，占位）。
 * @param packages - 待发布的包列表
 * @param releaseType - 预选 release type
 * @returns 包名到版本信息映射；用户取消时返回 `null`
 * @internal
 */
const getNewVersions = async (
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

    const ver = await askForNextVersion(name, info.old, releaseType);
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
      const fn = path.join(pkg.dir, 'package.json');

      const json = readJsonSync<PackageJson>(fn);
      if (!json) return;

      json.version = pkg.new;

      for (const type of PACKAGE_DEPENDENCY_KEYS) {
        const items = json[type] ?? {};

        for (const key of Object.keys(items)) {
          // skip workspace:* / workspace:^...
          if (items[key].startsWith(PNPM_BUILT_IN_VERSION)) continue;

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
 * Monorepo 按计算出的版本执行发布。
 * @param cwd - 包根目录
 * @param versions - 包名到新版本的映射
 * @param force - 是否强制发布
 * @param push - 是否推送
 * @returns Promise<void>
 * @internal
 */
const releaseMonrepoPackages = async (
  cwd: string,
  versions: Record<string, VersionInfo>,
  force: boolean,
  push: boolean
) => {
  if (!force) {
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

    logger.empty();
  }

  logger.step('Update version...');
  await updateVersions(versions);

  logger.step('Install dependencies...');
  installPnpm(cwd);

  if (getUnCommittedFiles(cwd).length < 1) {
    logger.error('No uncommitted changes');
    return;
  }

  logger.step('Committing...');
  addGit(cwd);

  const commitMsgFile = path.join(os.tmpdir(), 'release_commit_msg');
  writeFileSync(
    commitMsgFile,
    'chore: release packages',
    '',
    Object.entries(versions).map(([name, ver]) => `- ${name} ${ver.new}`)
  );

  commitGitByFile(commitMsgFile, cwd);

  if (push) {
    logger.step('Pushing...');
    pushGit(cwd);
  }
};

const releaseMultiPackages = async (
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

    logger.empty();
  }

  logger.step('Update version...');
  await updateVersions(versions);

  logger.empty();
  for (const [name, ver] of Object.entries(versions)) {
    await logger.scope({ namespace: name }, async log => {
      const cwd = ver.dir;

      log.step('Install dependencies...');
      installPnpm(cwd);

      if (getUnCommittedFiles(cwd).length < 1) {
        log.error('No uncommitted changes');
        return;
      }

      log.step('Committing...');
      addGit(cwd);

      const commitMsgFile = path.join(os.tmpdir(), 'release_commit_msg');
      writeFileSync(commitMsgFile, `chore: release package ${ver.new}`);

      commitGitByFile(commitMsgFile, cwd);

      if (push) {
        log.step('Pushing...');
        pushGit(cwd);
      }
    });
  }
};

/** `release` 命令解析后的选项类型 */
interface ReleaseOptions extends CommandOptionsType {
  check?: boolean;
  push?: boolean;
  type?: string;
  force?: boolean;
}

/**
 * Monorepo 发包向导：可选检查 git 状态、选择包、占位 bump 与发布。
 * @example
 * ```ts
 * // 运行示例：
 * // jshow release
 * // jshow release --force
 * // jshow release ./packages --check
 * ```
 */
export class ReleaseCommand extends BaseCommand<ReleaseOptions> {
  static name = 'release';

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
          description: 'The input directory',
          required: false
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
    options: { check = true, type, force = false, push = true }
  }: CommandContext<ReleaseOptions>): Promise<void> {
    let [inputRoot = '.'] = args;

    inputRoot = path.resolve(inputRoot);

    logger.info('Start', {
      cwd: process.cwd(),
      input: path.relative(process.cwd(), inputRoot)
    });
    logger.empty();

    if (check) {
      const files = getUnCommittedFiles(inputRoot);
      if (files.length > 0) {
        logger.error(
          "Repository isn't clean, commit or stash those changes first"
        );
        process.exit(1);
      }
    }

    const packages = getWorkspacePackages(inputRoot);
    const corePkg = packages.find(o => !!o.manifest.private);

    const selected = await filterReleasePackages(packages);
    if (selected.length === 0) {
      logger.warn('No packages to release');
      process.exit(1);
    }

    logger.empty();
    logger.label('Will bump:');
    logger.label(
      selected.map(o => `    ${o.name} ${o.manifest.version}`).join('\n')
    );
    logger.empty();

    const versions = await getNewVersions(selected, convertReleaseType(type));
    if (!versions) process.exit(1);

    if (corePkg) {
      await releaseMonrepoPackages(corePkg.dir, versions, !!force, !!push);
    } else {
      await releaseMultiPackages(versions, !!force, !!push);
    }

    logger.empty();
    logger.info('Completed');
  }
}
