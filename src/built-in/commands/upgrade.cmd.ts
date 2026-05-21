/**
 * @fileoverview `upgrade` 内置命令
 * @description
 * 扫描工作区内多仓或 monorepo，汇总依赖引用关系；
 * 先多选依赖名再查询 registry，经字段级确认后写回 `package.json`、`pnpm install`，并可选择提交与推送。
 * `--local` 已声明但尚未接入执行逻辑。
 */

import path from 'node:path';

import { type Logger } from '@jshow/logger';

import semver from 'semver';

import {
  BaseCommand,
  type CommandArgs,
  type CommandContext,
  type CommandOptionsType
} from '../../command';
import { logger as loggerCli } from '../../logger';
import {
  execSync,
  type PackageJsonKey,
  type PackageInfo,
  type PackageJson,
  getGroupPackages,
  type PackageGroup,
  PACKAGE_JSON_FILE,
  separateGroupPackages,
  toPatterns,
  jsonParse,
  readPnpmCatalogs,
  PNPM_BUILT_IN_WORKSPACE,
  PNPM_BUILT_IN_CATALOG,
  PNPM_WORKSPACE_FILE,
  uniq,
  flatMap,
  green,
  yellow,
  red,
  readJsonSync,
  writeJsonSync,
  confirmInquirer,
  inputInquirer,
  checkboxInquirer,
  commitGit,
  installPnpm,
  addGit,
  getUnCommittedFiles,
  pushGit
} from '../../utils';

const logger = loggerCli.fork({ namespace: 'upgrade' });

/** 工作区内链依赖在 manifest 中的典型声明，扫描时跳过。 */
const VERSION_WORKSPACE = 'workspace:*';

/** 通配版本占位，monorepo 根已锁定时可能从过滤结果中排除。 */
const VERSION_ALL = '*';

/** 某依赖在单个 `package.json` 中的出现记录（按依赖字段分组）。 */
interface PackageItem {
  /** 引用方包名（`manifest.name`） */
  name: string;
  /** 该 manifest 文件绝对路径 */
  file: string;
  /** 依赖字段名 → 版本字符串（如 `dependencies` → `^1.0.0`） */
  vers: Record<string, string>;
}

/** 聚合后的可升级依赖条目（含引用它的各包）。 */
interface PackageData {
  /** 依赖包名 */
  name: string;
  /** registry 或本地解析得到的目标版本 */
  ver: string;
  /** 是否在本次查询中判定为可升级 */
  updated: boolean;
  /** 仍需要改写的引用方列表 */
  items: PackageItem[];
}

/**
 * 升级流程共享可变状态。
 * @description `SCOPE_VERSIONS` / `DIFF_VERSIONS` 在 `preparePackageJson` 阶段填充。
 */
interface UpgradeParams {
  /** CLI 选项快照（`local` 尚未接入；`push` / `force` 用于 {@link commitChangeFiles}） */
  options: Omit<UpgradeOptions, 'ignore'>;
  /** `-i` 解析后的包名忽略正则列表 */
  IGNORE_PATTERNS: RegExp[];
  /** 预留：包名 → 聚合数据（当前流程主要用 `DIFF_VERSIONS`） */
  PKG_VERSIONS: Record<string, PackageData>;
  /** 带 scope 的根包对依赖名的「锁定」版本 */
  SCOPE_VERSIONS: Record<string, string>;
  /** 依赖名 → 各包中的引用记录 */
  DIFF_VERSIONS: Record<string, PackageItem[]>;
}

/** monorepo 根包升级时的额外上下文。 */
interface UpgradeMonorepoParams extends UpgradeParams {
  /** monorepo 根目录绝对路径 */
  ROOT_DIR: string;
  /** 根包 `package.json` 解析结果 */
  ROOT_JSON: PackageJson;
  /** 预留：catalog 锁定版本缓存（当前未写入） */
  CATALOG_VERSIONS: Record<string, string>;
  /** 工作区内本地包名/版本，用于 `pnpm search` 命中时标记 `workspace:*` */
  LOCAL_VERSIONS: Omit<PackageData, 'items'>[];
}

/**
 * 判断工作区声明的版本是否应视为「落后于」目标版本。
 * @param source - `package.json` 中的版本范围或精确版本
 * @param target - registry 上的目标版本
 * @returns 若 `^`/`~` 前缀则恒为 true；否则要求双方均为合法 semver 且 source < target
 */
const checkVersion = (source: string, target: string) => {
  if (source.startsWith('^') || source.startsWith('~')) return true;

  return semver.valid(source) && semver.lt(source, target);
};

/**
 * 收集某依赖在所有引用包中的版本字符串（去重）。
 * @param items - 同一依赖名的引用方列表
 * @returns 去重后的版本字符串数组
 * @internal
 */
const getUseds = (items: PackageItem[]) => {
  return uniq(flatMap(items.map(o => Object.values(o.vers))));
};

/**
 * 按目标版本过滤仍需要改写的引用项。
 * @param upgradeParams - 含 `SCOPE_VERSIONS` 的共享状态
 * @param name - 依赖包名
 * @param ver - registry 目标版本
 * @param items - 原始引用列表
 * @returns 过滤后仍应展示的 `PackageItem` 列表
 * @description monorepo 根若已固定某依赖版本（`SCOPE_VERSIONS[name]`），则跳过 `*` 通配引用。
 * @internal
 */
const filterPackageItems = (
  { SCOPE_VERSIONS }: UpgradeParams,
  name: string,
  ver: string,
  items: PackageItem[]
) => {
  return items
    .map(item => {
      // 仅保留仍落后于 registry 目标版本的字段；根已锁定时剔除 `*` 通配行
      const vers: string[][] = Object.entries(item.vers).filter(o => {
        if (SCOPE_VERSIONS[name]) {
          if (o[1] === VERSION_ALL) return false;
        } else {
          if (o[1] !== VERSION_ALL && !checkVersion(o[1], ver)) return false;
        }

        return true;
      });

      if (vers.length < 1) return;

      return { ...item, vers: Object.fromEntries(vers) };
    })
    .filter(Boolean) as PackageItem[];
};

/**
 * 扫描单个 manifest 的依赖字段，写入 `DIFF_VERSIONS` / `SCOPE_VERSIONS`。
 * @param upgradeParams - 可变扫描状态
 * @param pkg - 当前 `package.json` 对象
 * @param file - manifest 绝对路径
 * @param type - 依赖字段名或 `pnpm`（表示 `pnpm.overrides`）
 * @returns void
 * @internal
 */
const fillPackageVersions = (
  { DIFF_VERSIONS, SCOPE_VERSIONS }: UpgradeParams,
  pkg: PackageJson,
  file: string,
  type: PackageJsonKey
) => {
  const root = type === 'pnpm';
  const { name, scope = '' } = pkg;
  const record = (root ? pkg.pnpm?.overrides : pkg[type]) || {};

  for (const [k, v] of Object.entries(record)) {
    if (
      v.startsWith(PNPM_BUILT_IN_WORKSPACE) ||
      v.startsWith(PNPM_BUILT_IN_CATALOG)
    ) {
      continue;
    }

    if (scope) {
      // 带 scope 的根包：将该依赖视为 monorepo 级锁定版本，供后续 registry 对比
      SCOPE_VERSIONS[k] = v;
    } else {
      // 子包只记录落在当前 scope 前缀下的外部依赖，避免扫到无关包名
      if (!SCOPE_VERSIONS[k] && !k.startsWith(scope)) continue;
    }

    const list = (DIFF_VERSIONS[k] = DIFF_VERSIONS[k] || []);

    let item = list.find(o => o.name === name);
    if (!item) {
      item = { name, file, vers: {} };
      list.push(item);
    }

    item.vers[type] = v;
  }
};

/**
 * 将 `pnpm-workspace.yaml` 中的 catalog 条目并入 `DIFF_VERSIONS` / `SCOPE_VERSIONS`。
 * @param upgradeParams - 可变扫描状态
 * @param pkg - monorepo 根包信息
 * @internal
 */
const fillCatalogVersions = (
  { DIFF_VERSIONS, SCOPE_VERSIONS }: UpgradeParams,
  { dir, manifest }: PackageInfo
) => {
  const file = path.join(dir, PACKAGE_JSON_FILE);
  const catalogs = readPnpmCatalogs(dir);
  const name = PNPM_WORKSPACE_FILE;
  const scope = manifest.scope;

  for (const [type, record] of Object.entries(catalogs)) {
    for (const [k, v] of Object.entries(record)) {
      if (scope && k.startsWith(scope)) {
        if (!SCOPE_VERSIONS[k]) SCOPE_VERSIONS[k] = v;
        continue;
      }

      const list = (DIFF_VERSIONS[k] = DIFF_VERSIONS[k] || []);

      let item = list.find(o => o.name === name);
      if (!item) {
        item = { name, file, vers: {} };
        list.push(item);
      }

      item.vers[type] = v;
    }
  }
};

/**
 * 对单个包执行依赖扫描；`root` 为真时额外处理 `pnpm.overrides`。
 * @param upgradeParams - 可变扫描状态
 * @param pkg - 包信息与 manifest
 * @param root - 是否为 monorepo 根
 * @returns void
 * @internal
 */
const preparePackageJson = (
  upgradeParams: UpgradeParams,
  { dir, manifest }: PackageInfo,
  root?: boolean
) => {
  const file = path.join(dir, PACKAGE_JSON_FILE);

  fillPackageVersions(upgradeParams, manifest, file, 'dependencies');
  fillPackageVersions(upgradeParams, manifest, file, 'devDependencies');
  fillPackageVersions(upgradeParams, manifest, file, 'peerDependencies');
  fillPackageVersions(upgradeParams, manifest, file, 'optionalDependencies');

  if (root) {
    fillPackageVersions(upgradeParams, manifest, file, 'pnpm');
  }
};

/**
 * 从 `DIFF_VERSIONS` 推导待查询 registry 的依赖列表。
 * @param upgradeParams - 含 `DIFF_VERSIONS`、`IGNORE_PATTERNS`
 * @param versions - 累积结果（内部递归用）
 * @returns 待查询的 `PackageData` 草稿列表
 * @internal
 */
const filterRootVersions = (
  { IGNORE_PATTERNS, DIFF_VERSIONS }: UpgradeParams,
  versions: PackageData[] = []
) => {
  for (const [name, items] of Object.entries(DIFF_VERSIONS)) {
    if (IGNORE_PATTERNS.some(o => o.test(name))) continue;

    const useds = getUseds(items);
    if (useds.length < 1) continue;

    versions.push({ name, ver: useds[0], updated: false, items });
  }

  return versions;
};

/**
 * 多选待查询 registry 的依赖名（在 `pnpm info` 之前执行）。
 * @param log - 作用域日志
 * @param versions - {@link filterRootVersions} 得到的候选列表
 * @returns 用户勾选的子集；未选任何项时返回 `[]`
 * @internal
 */
const selectForUpgradePackages = async (
  log: Logger,
  versions: PackageData[]
) => {
  const selects = await checkboxInquirer(
    'Select the packages to upgrade',
    versions.map(o => o.name)
  );

  const data = versions.filter(o => selects.includes(o.name));
  if (data.length < 1) {
    log.info('No packages to upgrade');
    return [];
  }

  return data;
};

/**
 * 通过 `pnpm info --json` 查询公网包最新版本并过滤引用项。
 * @param upgradeParams - 共享状态（用于 {@link filterPackageItems}）
 * @param search - 传给 `pnpm info` 的包名
 * @param list - 该依赖在工作区内的引用列表
 * @returns 可升级条目；无有效版本或无需变更时返回 `null`
 * @internal
 */
const fetchPublicPackageVersion = async (
  upgradeParams: UpgradeParams,
  search: string,
  list: PackageItem[]
): Promise<PackageData | null> => {
  const output = execSync(`pnpm info --json ${search}`);

  const json = jsonParse(output.trim());
  if (!json) return null;

  const pack = Array.isArray(json) ? json[0] : json;
  if (pack == null || typeof pack !== 'object') return null;

  const meta = pack as {
    name?: string;
    version?: string;
    _id?: string;
  };

  let name = typeof meta.name === 'string' ? meta.name : '';
  let ver = typeof meta.version === 'string' ? meta.version : '';

  if (!name || !ver) {
    // 部分 registry 响应仅提供 `_id`（`name@version`），需手动拆分
    const id = typeof meta._id === 'string' ? meta._id : '';
    const at = id.lastIndexOf('@');
    if (at > 0) {
      name = id.slice(0, at);
      ver = id.slice(at + 1);
    }
  }

  if (!name || !ver || !semver.valid(ver)) return null;
  const items = filterPackageItems(upgradeParams, name, ver, list);
  if (items.length < 1) return null;

  return { name, ver, updated: true, items };
};

/**
 * 通过 `pnpm search` 解析 monorepo scope 下私有包版本，并合并进 `versions`。
 * @param upgradeParams - 须含 `ROOT_JSON.scope` 与 `LOCAL_VERSIONS`
 * @param versions - 就地追加可升级条目
 * @returns Promise<void>
 * @internal
 */
const fetchPrivatePackageVersions = async (
  log: Logger,
  upgradeParams: UpgradeMonorepoParams,
  versions: PackageData[]
) => {
  const SCOPE_PREFIX = upgradeParams.ROOT_JSON.scope;
  if (!SCOPE_PREFIX) return;

  const { LOCAL_VERSIONS, DIFF_VERSIONS, IGNORE_PATTERNS, ROOT_DIR } =
    upgradeParams;

  const TEXT = 'fetching private packages';

  log.write(`${TEXT}: ${SCOPE_PREFIX}`);

  const output = execSync(
    `pnpm search --searchlimit 99999 -p --no-description ${SCOPE_PREFIX}`,
    { cwd: ROOT_DIR }
  );

  output.split('\n').forEach((v, i, lines) => {
    // `pnpm search` 为 TSV：包名、描述、版本等列以制表符分隔
    const l = v.split('\t').filter(Boolean);

    const name = l.at(0);
    if (!name || IGNORE_PATTERNS.some(p => p.test(name))) return;

    let ver = '';
    for (let i = l.length - 1; i > 0; i--) {
      // 从行尾向前找第一个合法 semver（描述列可能含数字）
      if (semver.valid(l[i])) {
        ver = l[i];

        break;
      }
    }
    if (!ver) return;

    log.write(
      `${TEXT}: ${i + 1}/${lines.length} [ ${name}@${ver} ] (vers: ${versions.length})`
    );

    let items = DIFF_VERSIONS[name];
    if (!items || items.length < 1) return;

    if (LOCAL_VERSIONS.find(o => o.name === name)) {
      // 工作区内已有同名包时，报告为 workspace 链而非 registry 版本
      ver = VERSION_WORKSPACE;
    } else {
      items = filterPackageItems(upgradeParams, name, ver, items);

      if (items.length < 1) return;
    }

    versions.push({ name, ver, updated: true, items });
  });

  log.write(`fetched private packages: ${versions.length}\n`);
  log.empty();
};

/**
 * 对「多独立包」或 monorepo 子集：按 `SCOPE_VERSIONS` 逐个 `pnpm info` 并汇总。
 * @param params - 已完成 `preparePackageJson` 的状态
 * @param versions - 累积结果
 * @returns 判定为可升级的依赖列表
 * @internal
 */
const getMultiPackageVersions = async (log: Logger, params: UpgradeParams) => {
  const versions: PackageData[] = [];

  const rlist = filterRootVersions(params);
  if (rlist.length < 1) return versions;

  const selects = await selectForUpgradePackages(log, rlist);
  if (selects.length < 1) return versions;

  const TEXT = 'fetching public packages';

  log.write(`${TEXT}: ${selects.length}`);

  for (let i = 0; i < selects.length; i++) {
    const item = selects[i];
    log.write(
      `${TEXT}: ${i + 1}/${selects.length} [ ${item.name}@${item.ver} ] (vers: ${versions.length})`
    );

    const version = await fetchPublicPackageVersion(
      params,
      item.name,
      item.items
    );
    if (!version) continue;

    versions.push(version);
  }

  log.write(`fetched public packages: ${versions.length}\n`);
  log.empty();

  return versions;
};

/**
 * monorepo：先公网依赖再 {@link fetchPrivatePackageVersions} 私有 scope 包。
 * @param params - monorepo 扫描上下文
 * @returns 可升级依赖列表
 * @internal
 */
const getMonorepoPackageVersions = async (
  log: Logger,
  params: UpgradeMonorepoParams
) => {
  const versions = await getMultiPackageVersions(log, params);

  await fetchPrivatePackageVersions(log, params, versions);

  return versions;
};

/**
 * 打印扫描阶段收集到的「Used Packages」表。
 * @param log - 作用域日志
 * @param versions - `DIFF_VERSIONS` 映射
 * @returns void
 * @internal
 */
const showUsedPackages = (
  log: Logger,
  versions: UpgradeParams['DIFF_VERSIONS']
) => {
  log.label('Used Packages');
  log.table(
    Object.entries(versions).map(o => ({
      name: o[0],
      useds: getUseds(o[1])
    }))
  );
  log.empty();
};

/**
 * 打印「Need Change Packages」表（含目标版本与各引用方当前版本）。
 * @param log - 作用域日志
 * @param versions - 可升级条目列表
 * @returns void
 * @internal
 */
const showNeedChangePackages = (log: Logger, versions: PackageData[]) => {
  if (!log.checkLevel('debug')) return;

  log.label('Need Change Packages');
  log.table(
    versions.map(o => ({
      name: o.name,
      upgrade: `[ ${getUseds(o.items).join(',')} ] -> ${o.ver}`
    }))
  );
  log.empty();
};

//#region select and confirm upgrade packages

/**
 * 对单条 manifest 字段确认目标版本（可覆盖为自定义 semver）。
 * @internal
 */
const changeForUpgradeInfo = async (
  log: Logger,
  upgradeFile: Record<string, string>,
  info: PackageItem,
  version: string,
  name: string,
  type: string,
  ver: string
) => {
  let newVer = version;

  const yes = await confirmInquirer(
    [`[ ${yellow(type)} ] in ${info.name}`, `    ${ver} => ${newVer}`].join(
      '\n'
    )
  );

  if (!yes) {
    let value = await inputInquirer(
      `Enter custom version for [ ${yellow(type)} ] in ${info.name}`,
      ver
    );
    value = value.trim();

    if (!value) {
      log.info(red(`No version input, Abandon change.`));
      log.empty();
      return;
    }

    if (value === ver) {
      log.info(red(`Version not changed, Abandon change.`));
      log.empty();
      return;
    }

    if (!semver.valid(value)) {
      log.info(red(`Version is invalid, Abandon change.`));
      log.empty();
      return;
    }

    newVer = value;
  }
  log.empty();

  upgradeFile[`${type}|${name}`] = newVer;
};

/**
 * 遍历某依赖在所有引用包中的字段，写入 `upgradeRecord[file]`。
 * @internal
 */
const askForUpgradeInfo = async (
  log: Logger,
  { SCOPE_VERSIONS }: UpgradeParams,
  upgradeRecord: Record<string, Record<string, string>>,
  name: string,
  version: string,
  info: PackageItem
) => {
  const upgradeFile = (upgradeRecord[info.file] =
    upgradeRecord[info.file] || {});

  for (const [type, ver] of Object.entries(info.vers)) {
    if (
      ver.startsWith(PNPM_BUILT_IN_WORKSPACE) ||
      ver.startsWith(PNPM_BUILT_IN_CATALOG)
    )
      continue;

    let newVer = '';
    if (version.startsWith(PNPM_BUILT_IN_WORKSPACE)) newVer = VERSION_WORKSPACE;
    else if (version.startsWith(PNPM_BUILT_IN_CATALOG)) newVer = version;
    else if (SCOPE_VERSIONS[name]) newVer = VERSION_ALL;
    else newVer = version;

    await changeForUpgradeInfo(log, upgradeFile, info, newVer, name, type, ver);
  }
};

/**
 * 对用户已选依赖逐项确认各 manifest 字段的目标版本。
 * @returns `文件路径 → { "字段|包名": 版本 }` 映射
 * @internal
 */
const confirmForUpgradePackages = async (
  log: Logger,
  upgradeParams: UpgradeParams,
  selects: PackageData[]
) => {
  const upgradeRecord: Record<string, Record<string, string>> = {};

  for (const item of selects) {
    log.info(`Confirm upgrade [ ${green(item.name)} ] package`);

    for (const info of item.items) {
      await askForUpgradeInfo(
        log,
        upgradeParams,
        upgradeRecord,
        item.name,
        item.ver,
        info
      );
    }
  }

  if (Object.keys(upgradeRecord).length < 1) return null;

  return upgradeRecord;
};

//#endregion

//#region upgrade package files

/**
 * 按写回计划更新单个 `package.json` 中的依赖字段。
 * @param record - 就地累积「包名 → 新版本」摘要
 * @internal
 */
const upgradeFile = async (
  record: Record<string, string>,
  file: string,
  target: Record<string, string>
) => {
  const pkg = await readJsonSync<PackageJson>(file);
  if (!pkg) return;

  let changed = false;
  for (const [temp, ver] of Object.entries(target)) {
    const [type, name] = temp.split('|');
    if (!name) continue;

    const data = (
      type === 'pnpm' ? pkg.pnpm?.overrides : pkg[type as PackageJsonKey]
    ) as Record<string, string>;
    if (!data?.[name]) continue;

    data[name] = ver;
    changed = true;

    record[name] =
      ver === VERSION_ALL ||
      ver === VERSION_WORKSPACE ||
      ver.startsWith(PNPM_BUILT_IN_CATALOG)
        ? 'formatted'
        : ver;
  }

  if (!changed) return;

  writeJsonSync(file, pkg);
};

/**
 * monorepo：并行写回各 manifest 后于根目录执行一次 `pnpm install`。
 * @returns 发生变更的依赖名与版本条目列表
 * @internal
 */
const upgradeMonorepoFiles = async (
  log: Logger,
  upgradeParams: UpgradeMonorepoParams,
  upgradeRecord: Record<string, Record<string, string>>
) => {
  const changedRecord: Record<string, string> = {};

  await Promise.all(
    Object.entries(upgradeRecord).map(o =>
      upgradeFile(changedRecord, o[0], o[1])
    )
  );

  const result = Object.entries(changedRecord);
  if (result.length > 0) {
    log.label('Upgrade pnpm-lock.yaml ...');

    installPnpm(upgradeParams.ROOT_DIR);
  }

  return result;
};

/**
 * 多独立包：写回 manifest 并按仓库目录分组变更摘要。
 * @returns `[manifest路径, [包名, 版本][]][]`；无变更时为 `null`
 * @internal
 */
const upgradeMultiFiles = async (
  log: Logger,
  { DIFF_VERSIONS }: UpgradeParams,
  upgradeRecord: Record<string, Record<string, string>>
): Promise<Array<[string, Array<[string, string]>]> | null> => {
  const changedRecord: Record<string, string> = {};

  await Promise.all(
    Object.entries(upgradeRecord).map(o =>
      upgradeFile(changedRecord, o[0], o[1])
    )
  );

  const files: Record<string, Set<string>> = {};
  const record: Record<string, Array<[string, string]>> = {};

  for (const [name, ver] of Object.entries(changedRecord)) {
    const items = DIFF_VERSIONS[name];
    if (!items) continue;

    for (const item of items) {
      const file = (files[item.file] = files[item.file] || new Set());
      const list = (record[item.file] = record[item.file] || []);

      if (file.has(name)) continue;

      file.add(name);
      list.push([name, ver]);
    }
  }

  const result = Object.entries(record);

  if (result.length < 1) {
    log.label('No packages to upgrade');
    log.empty();
    return null;
  }

  return result;
};

//#endregion

/**
 * 在 `cwd` 下可选执行 `git add`、多行 `commitGit` 与 `pushGit`。
 * @description `--force` 时跳过提交与推送确认；`getUnCommittedFiles` 为空则跳过提交；仅当 `options.push` 为真时执行 push。
 * @internal
 */
const commitChangeFiles = async (
  log: Logger,
  changes: Array<[string, string]>,
  options: UpgradeParams['options'],
  cwd: string
) => {
  if (!options.force) {
    const yes = await confirmInquirer('Continue commit changes.');
    if (!yes) return;
  }

  if (getUnCommittedFiles(cwd).length < 1) {
    log.label('No changes to commit.');
    return;
  }

  log.label('Committing changes...');
  addGit(cwd);

  commitGit(
    [
      'chore: upgrade dependencies',
      '',
      ...changes.map(o => `- ${o.filter(Boolean).join(' ')}`)
    ],
    cwd
  );

  if (!options.force) {
    const yes = await confirmInquirer('Push to remote repository.');
    if (!yes) return;
  }

  if (options.push) {
    log.label('Pushing to remote repository...');
    await pushGit(cwd);
  }

  log.empty();
};

/**
 * 多独立包布局的升级入口：扫描 → 查 registry → 交互写回 → 各仓 install/commit。
 * @param log - 作用域日志
 * @param packages - 待分析包列表
 * @param params - CLI 选项与忽略模式
 * @returns 存在可升级项时为 `true`，否则 `false`
 * @internal
 */
const upgradeMultiPackages = async (
  log: Logger,
  packages: PackageInfo[],
  params: UpgradeParams
) => {
  const upgradeParams: UpgradeParams = {
    ...params,
    DIFF_VERSIONS: {},
    SCOPE_VERSIONS: {}
  };

  for (const pkg of packages) preparePackageJson(upgradeParams, pkg);

  showUsedPackages(log, upgradeParams.DIFF_VERSIONS);

  const versions = await getMultiPackageVersions(log, upgradeParams);
  if (versions.length < 1) return false;

  showNeedChangePackages(log, versions);

  const upgradeRecord = await confirmForUpgradePackages(
    log,
    upgradeParams,
    versions
  );
  if (!upgradeRecord) return false;

  const changeRecord = await upgradeMultiFiles(
    log,
    upgradeParams,
    upgradeRecord
  );
  if (!changeRecord) return false;

  const cwd = process.cwd();

  for (const [file, list] of changeRecord) {
    const dir = path.dirname(file);

    await log.scope({ namespace: path.relative(cwd, dir) }, async lg => {
      lg.label(`Upgrade pnpm-lock.yaml ...`);

      installPnpm(dir);

      await commitChangeFiles(lg, list, upgradeParams.options, dir);
    });
  }

  return true;
};

/**
 * 单个 monorepo 根的升级入口：根 + `children` 扫描后查公网/私有 registry 并写回。
 * @param log - 作用域日志
 * @param group - monorepo 根及子包
 * @param params - CLI 选项与忽略模式
 * @returns 存在可升级项时为 `true`，否则 `false`
 * @internal
 */
const upgradeMonorepoPackage = async (
  log: Logger,
  group: PackageGroup,
  params: UpgradeParams
) => {
  const upgradeParams: UpgradeMonorepoParams = {
    ...params,
    ROOT_DIR: group.dir,
    ROOT_JSON: group.manifest,
    DIFF_VERSIONS: {},
    SCOPE_VERSIONS: {},
    CATALOG_VERSIONS: {},
    LOCAL_VERSIONS: [
      { name: group.name, ver: group.manifest.version, updated: false }
    ]
  };

  fillCatalogVersions(upgradeParams, group);

  preparePackageJson(upgradeParams, group, true);
  for (const pkg of group.children) preparePackageJson(upgradeParams, pkg);

  showUsedPackages(log, upgradeParams.DIFF_VERSIONS);

  const versions = await getMonorepoPackageVersions(log, upgradeParams);
  if (versions.length < 1) return false;

  showNeedChangePackages(log, versions);

  const upgradeRecord = await confirmForUpgradePackages(
    log,
    upgradeParams,
    versions
  );
  if (!upgradeRecord) return false;

  const changes = await upgradeMonorepoFiles(log, upgradeParams, upgradeRecord);
  if (changes.length < 1) return false;

  await commitChangeFiles(
    log,
    changes,
    upgradeParams.options,
    upgradeParams.ROOT_DIR
  );

  return true;
};

/** `upgrade` 命令 CLI 选项。 */
export interface UpgradeOptions extends CommandOptionsType {
  /** 是否在 monorepo 内优先解析本地包版本（已声明，执行逻辑待接） */
  local: boolean;
  /** 逗号分隔的依赖名忽略模式，见 {@link toPatterns} */
  ignore?: string;
  /** 为真时跳过提交与推送的交互确认（仍会受 `push` 控制是否实际 push） */
  force: boolean;
  /** 写回并提交后是否执行 `git push`（默认 `true`） */
  push: boolean;
}

/** `execute` 末尾 Report 表的行结构。 */
interface UpgradeReport {
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
 * 工作区依赖升级命令。
 * @description 支持多独立仓库目录与 monorepo 根两种布局，二者不可混跑；交互确认后写回并可选 Git 提交/推送。
 * @example
 * ```bash
 * jshow upgrade ./workspace
 * jshow upgrade ./workspace -i "@scope/internal-"
 * ```
 */
export class UpgradeCommand extends BaseCommand<UpgradeOptions> {
  static key = 'upgrade';

  public get args(): CommandArgs {
    return {
      name: 'upgrade',
      group: 'devOps',
      description: 'Upgrade the workspace dependencies',
      examples: [
        'jshow upgrade',
        'jshow upgrade ./workspace',
        'jshow upgrade -i "@scope/internal-"',
        'jshow upgrade --local',
        'jshow upgrade --push'
      ],
      arguments: [
        {
          name: 'input',
          description: 'The input directory'
        }
      ],
      options: [
        {
          name: 'local',
          abbr: 'l',
          description: 'Upgrade the workspace dependencies locally',
          defaultValue: false
        },
        {
          name: 'ignore',
          abbr: 'i',
          description: 'The ignore packages',
          flagValue: true
        },
        {
          name: 'force',
          abbr: 'f',
          description: 'Force the upgrade',
          defaultValue: false
        },
        {
          name: 'push',
          abbr: 'p',
          description: 'Push the upgrade to the remote repository',
          defaultValue: true,
          invert: true
        }
      ]
    };
  }

  /**
   * 扫描工作区依赖升级：multi 与 monorepo 不可混跑，末尾输出 Report 表。
   * @param context - Commander 解析后的参数与选项
   * @returns Promise<void>；混跑布局时 `process.exit(1)`
   */
  public async execute({
    args,
    options: { ignore, ...options }
  }: CommandContext<UpgradeOptions>): Promise<void> {
    let [inputRoot = '.'] = args;

    inputRoot = path.resolve(inputRoot);

    const cwd = process.cwd();
    logger.info('Start', {
      cwd,
      input: path.relative(cwd, inputRoot),
      options: {
        ignore,
        ...options
      }
    });
    logger.empty();

    const packages = getGroupPackages(inputRoot);
    const [multiPackages, monorepoPackages] = separateGroupPackages(packages);

    if (multiPackages.length > 0 && monorepoPackages.length > 0) {
      // 两种布局的 registry/scope 查询路径不同，混扫会导致结果不可解释
      logger.error(
        'Cannot upgrade both multi and monorepo packages at the same time'
      );
      process.exit(1);
    }

    const upgradeParams: UpgradeParams = {
      options,
      IGNORE_PATTERNS: toPatterns(ignore),
      PKG_VERSIONS: {},
      SCOPE_VERSIONS: {},
      DIFF_VERSIONS: {}
    };

    const reports: UpgradeReport[] = [];

    if (multiPackages.length > 0) {
      logger.label(`Upgrade multi packages: ${multiPackages.length}`);

      await logger.scope({ namespace: 'mult' }, async log => {
        // 日志 scope 与 release 命令一致，便于多段输出时分段过滤
        const status = await upgradeMultiPackages(
          log,
          multiPackages,
          upgradeParams
        );

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
      logger.label(`Upgrade monorepo packages: ${mpcount}`);

      for (const pkg of monorepoPackages) {
        await logger.scope({ namespace: `mrepo: ${pkg.name}` }, async log => {
          const status = await upgradeMonorepoPackage(log, pkg, upgradeParams);

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
