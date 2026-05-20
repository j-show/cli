# upgrade 命令

实现：`src/built-in/commands/upgrade.cmd.ts`  
注册：`src/built-in/commands/index.ts` 的 `BUILT_IN_COMMANDS`（随 `initBuiltIn` 默认加载）。

## 功能

- 扫描指定目录下的工作区包（`getGroupPackages`），区分 **多独立包** 与 **monorepo 根** 两种布局，**不可同时处理**。
- 汇总各包 `package.json` 中的依赖声明（含 `pnpm.overrides`、catalog），构建「依赖名 → 哪些包、何种版本」的映射。
- **先多选**待查询的依赖名，再对选中项执行 `pnpm info`（公网）或 `pnpm search`（monorepo scope 私有包）。
- 输出 **Used Packages**（扫描引用）；**Need Change Packages** 仅在 debug 日志级别打印。
- 交互：按 manifest 字段逐项确认版本（可输入自定义 semver）→ 写回 `package.json` → `installPnpm` → 可选 Git 提交/推送。
- **`--local`**：CLI 已声明，执行逻辑尚未接入。

## 命令行

| 项 | 说明 |
| --- | --- |
| 位置参数 `input` | 扫描根目录，默认 `.` |
| `-i, --ignore` | 逗号分隔包名过滤（`toPatterns`），匹配的依赖跳过 |
| `-f, --force` | 跳过「是否提交」与「是否推送到远程」确认（是否 push 仍由 `--push` 决定） |
| `-p, --push` | 提交后是否 `git push`，默认 `true` |
| `-l, --local` | 已声明，实现待接 |

## 逻辑顺序

### 1. 入口 `execute`

1. 解析 `input` 为绝对路径。
2. `getGroupPackages` → `separateGroupPackages` 得到 `multiPackages` / `monorepoPackages`。
3. 若两类均非空 → 报错退出。
4. 初始化 `UpgradeParams`（`IGNORE_PATTERNS`、`SCOPE_VERSIONS`、`DIFF_VERSIONS` 等）。
5. 有 multi → `upgradeMultiPackages`；有 mono → 对每个根依次 `upgradeMonorepoPackage`。
6. 打印 `Report` 表（type / name / count / status）并结束。

### 2. 扫描阶段（`preparePackageJson` / `fillCatalogVersions`）

对每个目标 `package.json`：

1. 遍历 `dependencies` / `devDependencies` / `peerDependencies` / `optionalDependencies`（monorepo 根额外扫 `pnpm.overrides`）。
2. 跳过 `workspace:`、`catalog:` 前缀声明（写回阶段对 catalog 另有处理）。
3. 写入 `DIFF_VERSIONS[依赖名]`：记录引用方包名、文件路径、各字段下的版本字符串。
4. 若包带 `scope`，同步写入 `SCOPE_VERSIONS[依赖名]`（视为根级锁定版本）。
5. monorepo 根另从 `pnpm-workspace.yaml` 读取 catalog 并入 `DIFF_VERSIONS`。

### 3. 多独立包分支 `upgradeMultiPackages`

1. 对每个包执行扫描 → `showUsedPackages`。
2. `getMultiPackageVersions`：`filterRootVersions` → `selectForUpgradePackages`（先多选依赖名）→ 仅对选中项 `pnpm info --json`，`filterPackageItems` 过滤仍须改写的引用。
3. `confirmForUpgradePackages`：对已解析出的可升级项逐 manifest 字段确认目标版本。
4. `upgradeMultiFiles`：写回各 manifest，按仓库目录分组变更列表。
5. 对每个发生变更的目录：`installPnpm`，再 `commitChangeFiles`（可选提交/推送）。

### 4. Monorepo 分支 `upgradeMonorepoPackage`

1. 先扫 **根包**（含 overrides）与 catalog，再扫 **children**。
2. `getMonorepoPackageVersions`：公网 `pnpm info` + `fetchPrivatePackageVersions`（`pnpm search`）。
3. 交互写回 → `upgradeMonorepoFiles`（根目录一次 `installPnpm`）→ `commitChangeFiles`。

### 5. Git 提交（`commitChangeFiles`）

1. 非 `--force` 时确认是否继续提交；`getUnCommittedFiles` 为空则跳过。
2. `addGit`（`git add -A`），`commitGit` 多行信息：`chore: upgrade dependencies` + 变更列表。
3. 非 `--force` 时询问是否推送；`--push` 为真时执行 `pushGit`。

## 版本判定要点

- `checkVersion`：`^` / `~` 视为可升级；否则要求合法 semver 且当前声明 **小于** registry 版本。
- monorepo 根已在 `SCOPE_VERSIONS` 中锁定的依赖，子包里的 `*` 通配引用会被忽略。
- 工作区内已有同名私有包时，报告目标版本为 `workspace:*`。

## 示例

```bash
jshow upgrade
jshow upgrade ./workspace
jshow upgrade -i "@scope/internal-"
jshow upgrade --force          # 跳过提交/推送确认
```
