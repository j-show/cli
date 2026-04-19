import path from 'node:path';

import { type Logger } from '@jshow/logger';
import { flatMap, uniq } from 'lodash-es';
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
  toPatterns
} from '../../utils';

const logger = loggerCli.fork({ namespace: 'upgrade' });

const VERSION_WORKSPACE = 'workspace:*';

const VERSION_ALL = '*';

interface PackageItem {
  name: string;
  file: string;
  vers: Record<string, string>;
}

interface PackageData {
  name: string;
  ver: string;
  updated: boolean;
  items: PackageItem[];
}

interface UpgradeParams {
  IGNORE_PATTERNS: RegExp[];
  PKG_VERSIONS: Record<string, PackageData>;
}

interface UpgradeMultiParams extends UpgradeParams {
  DIFF_VERSIONS: Record<string, PackageItem[]>;
  ROOT_VERSIONS: Record<string, string>;
}

interface UpgradeMonorepoParams extends UpgradeMultiParams {
  ROOT_DIR: string;
  ROOT_JSON: PackageJson;
  LOCAL_VERSIONS: Omit<PackageData, 'items'>[];
}

const checkVersion = (source: string, target: string) => {
  if (source.startsWith('^') || source.startsWith('~')) return true;

  return semver.valid(source) && semver.lt(source, target);
};

const getUseds = (items: PackageItem[]) => {
  return uniq(flatMap(items.map(o => Object.values(o.vers))));
};

const filterPackageItems = (
  { ROOT_VERSIONS }: UpgradeParams,
  name: string,
  ver: string,
  items: PackageItem[]
) => {
  return items
    .map(item => {
      const vers: string[][] = Object.entries(item.vers).filter(o => {
        if (ROOT_VERSIONS[name]) {
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

const fillPackageVersions = (
  { DIFF_VERSIONS, ROOT_VERSIONS }: UpgradeParams,
  pkg: PackageJson,
  file: string,
  type: PackageJsonKey
) => {
  const root = type === 'pnpm';
  const { name, scope = '' } = pkg;
  const record = (root ? pkg.pnpm?.overrides : pkg[type]) || {};

  const entries = Object.entries(record);
  for (const [k, v] of entries) {
    if (v.startsWith(VERSION_WORKSPACE)) continue;

    if (scope) {
      ROOT_VERSIONS[k] = v;
    } else {
      if (!ROOT_VERSIONS[k] && !k.startsWith(scope)) return;
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

const filterRootVersions = (
  { IGNORE_PATTERNS, ROOT_VERSIONS, DIFF_VERSIONS }: UpgradeParams,
  versions: PackageData[] = [],
  SCOPE_PREFIX?: string
) => {
  const entries = Object.entries(ROOT_VERSIONS);
  for (const [name, ver] of entries) {
    if (!ver) continue;
    if (IGNORE_PATTERNS.some(p => p.test(name))) continue;
    if (SCOPE_PREFIX && name.startsWith(SCOPE_PREFIX)) continue;

    const items = DIFF_VERSIONS[name];
    if (!items) continue;

    const useds = getUseds(items);
    if (!useds.some(o => checkVersion(o, ver))) continue;

    versions.push({ name, ver, updated: false, items });
  }

  return versions;
};

const fetchPublicPackageVersion = async (
  upgradeParams: UpgradeParams,
  search: string,
  list: PackageItem[]
): Promise<PackageData | null> => {
  const output = execSync(`pnpm info --json ${search}`, { silent: true });

  const json = JSON.parse(output.trim());
  if (!json || typeof json !== 'object') return null;

  const data = json._id.splice('@');

  const ver = data.splice(-1, 1)[0];
  if (!ver) return null;

  const name = data.join('@');

  const items = filterPackageItems(upgradeParams, name, ver, list);
  if (items.length < 1) return null;

  return { name, ver, updated: true, items };
};

const fetchPrivatePackageVersions = async (
  upgradeParams: UpgradeMonorepoParams,
  versions: PackageData[]
) => {
  const SCOPE_PREFIX = upgradeParams.ROOT_JSON.scope;
  if (!SCOPE_PREFIX) return;

  const { LOCAL_VERSIONS, DIFF_VERSIONS, IGNORE_PATTERNS } = upgradeParams;

  const output = execSync(
    `pnpm search --searchlimit 99999 -p --no-description ${SCOPE_PREFIX}`,
    { silent: true }
  );

  output.split('\n').forEach(v => {
    const l = v.split('\t').filter(Boolean);

    const name = l.at(0);
    if (!name || IGNORE_PATTERNS.some(p => p.test(name))) return;

    let ver = '';
    for (let i = l.length - 1; i > 0; i--) {
      if (semver.valid(l[i])) {
        ver = l[i];

        break;
      }
    }
    if (!ver) return;

    let items = DIFF_VERSIONS[name];
    if (!items || items.length < 1) return;

    if (LOCAL_VERSIONS.find(o => o.name === name)) {
      ver = VERSION_WORKSPACE;
    } else {
      items = filterPackageItems(upgradeParams, name, ver, items);

      if (items.length < 1) return;
    }

    versions.push({ name, ver, updated: true, items });
  });
};

const getMultiPackageVersions = async (
  params: UpgradeParams,
  scope?: string,
  versions: PackageData[] = []
) => {
  const list = filterRootVersions(params, [], scope);

  for (const item of list) {
    const version = await fetchPublicPackageVersion(
      params,
      item.name,
      item.items
    );
    if (!version) continue;

    versions.push(version);
  }

  return versions;
};

const getMonorepoPackageVersions = async (params: UpgradeMonorepoParams) => {
  const versions = await getMultiPackageVersions(
    params,
    params.ROOT_JSON.scope
  );

  await fetchPrivatePackageVersions(params, versions);

  return versions;
};

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

const showNeedChangePackages = (log: Logger, versions: PackageData[]) => {
  log.label('Need Change Packages');
  log.table(
    versions.map(o => ({ ...o, useds: getUseds(o.items) })),
    ['name', 'ver', 'useds']
  );
  log.empty();
};

const upgradeMultiPackages = async (
  log: Logger,
  packages: PackageInfo[],
  params: UpgradeParams
) => {
  const upgradeParams: UpgradeMultiParams = {
    ...params,
    DIFF_VERSIONS: {},
    ROOT_VERSIONS: {}
  };

  for (const pkg of packages) preparePackageJson(upgradeParams, pkg);

  showUsedPackages(log, upgradeParams.DIFF_VERSIONS);

  const versions = await getMultiPackageVersions(upgradeParams);
  if (versions.length < 1) return false;

  showNeedChangePackages(log, versions);

  return true;
};

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
    ROOT_VERSIONS: {},
    LOCAL_VERSIONS: [
      { name: group.name, ver: group.manifest.version, updated: false }
    ]
  };

  preparePackageJson(upgradeParams, group, true);
  for (const pkg of group.children) preparePackageJson(upgradeParams, pkg);

  showUsedPackages(log, upgradeParams.DIFF_VERSIONS);

  const versions = await getMonorepoPackageVersions(upgradeParams);
  if (versions.length < 1) return false;

  showNeedChangePackages(log, versions);

  return true;
};

interface UpgradeOptions extends CommandOptionsType {
  local?: boolean;
  ignore: string;
  push: boolean;
}

export class UpgradeCommand extends BaseCommand<UpgradeOptions> {
  static name = 'upgrade';

  public get args(): CommandArgs {
    return {
      name: 'upgrade',
      group: 'devOps',
      description: 'Upgrade the workspace dependencies',
      examples: [
        'jshow upgrade',
        'jshow upgrade --check',
        'jshow upgrade --push',
        'jshow upgrade --type patch',
        'jshow upgrade --force'
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
          description: 'The ignore packages'
        },
        {
          name: 'push',
          abbr: 'p',
          description: 'Push the upgrade to the remote repository',
          defaultValue: true
        }
      ]
    };
  }

  public async execute({
    args,
    options: { ignore, ...options }
  }: CommandContext<UpgradeOptions>): Promise<void> {
    let [inputRoot = '.'] = args;

    inputRoot = path.resolve(inputRoot);

    logger.info('Start', {
      cwd: process.cwd(),
      input: path.relative(process.cwd(), inputRoot)
    });
    logger.empty();

    const packages = getGroupPackages(inputRoot);
    const [multiPackages, monorepoPackages] = separateGroupPackages(packages);

    if (multiPackages.length > 0 && monorepoPackages.length > 0) {
      logger.error(
        'Cannot upgrade both multi and monorepo packages at the same time'
      );
      process.exit(1);
    }

    const upgradeParams: UpgradeParams = {
      IGNORE_PATTERNS: toPatterns(ignore),
      PKG_VERSIONS: {}
    };

    const reports: Array<[string, string, number, boolean]> = [];

    if (multiPackages.length > 0) {
      logger.label(`Upgrade multi packages: ${multiPackages.length}`);

      await logger.scope({ namespace: 'mult' }, async log => {
        const status = await upgradeMultiPackages(
          log,
          multiPackages,
          upgradeParams
        );

        reports.push(['multi', '-', multiPackages.length, status]);
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

          reports.push(['mono', pkg.name, pkg.children.length, status]);
        });
        logger.empty();
      }

      logger.label('--------------------------------');
      logger.empty();
    }

    logger.label('Report:');
    logger.table(reports, ['type', 'name', 'count', 'status']);
    logger.empty();

    logger.info('Completed');
  }
}
