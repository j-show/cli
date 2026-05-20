# release 命令

实现：`src/built-in/commands/release.cmd.ts`  
注册：`src/built-in/commands/index.ts` 的 `BUILT_IN_COMMANDS`（随 `initBuiltIn` 默认加载）。

## 功能

- 在指定目录下用 `getGroupPackages` 扫描工作区，经 `separateGroupPackages` 分为 **多独立包** 与 **monorepo 根** 两类；**允许同一次命令中先后处理**（与 `upgrade` 的互斥校验不同）。
- 交互多选待发布的**非 private** 子包（`filterReleasePackages`）。
- 为每个选中包计算下一版本：`semver` bump（支持 `major` / `minor` / `patch` 及预发版的 `pre*` 类型），或通过 `-t` 预选类型；亦可选手动输入合法 semver。
- 写回各包 `package.json` 的 `version`；若同批发布的包名出现在 `dependencies` / `devDependencies` / `peerDependencies` 中，且版本非 `workspace:`，则同步改为对应新版本。
- 可选执行包内 `scripts.updateVersion:post`（`pnpm updateVersion:post`）。
- `installPnpm` 安装依赖后，`addGit` + `commitGit` 提交；`--push` 为真时 `pushGit`。
- 可选 `-c` / `--check`：发版前检查工作区是否干净（多仓与 monorepo 策略不同，见下文）。

## 命令行

| 项 | 说明 |
| --- | --- |
| 位置参数 `input` | 扫描根目录，默认 `.` |
| `-c, --check` | 发版前检查未提交变更，默认 `true` |
| `-t, --type` | 预选 semver 递增类型：`major` / `minor` / `patch`（非法值则进入交互选择） |
| `-f, --force` | 跳过部分确认：monorepo 跳过 bump 汇总确认；多仓跳过「二次勾选要发布的包」 |
| `-p, --push` | 提交后是否 `git push`，默认 `true` |

## 逻辑顺序

### 1. 入口 `execute`

1. 解析 `input` 为绝对路径。
2. `getGroupPackages` → `separateGroupPackages` 得到 `multiPackages`、`monorepoPackages`。
3. 若有 `multiPackages` → `releaseMultiPackages`（scope `multi`），结果写入 `Report`。
4. 对每个 `monorepoPackages` 根 → `releaseMonrepoPackage`（scope `mrepo: <name>`），结果写入 `Report`。
5. 打印 `Report` 表（`type` / `name` / `count` / `status`）并结束。

### 2. 发版前检查（`--check`）

**Monorepo 根**（`checkPackageUncommittedForMonorepo`）：

- 在 monorepo **根目录** `getUnCommittedFiles`；非空则报错并中止该 monorepo 流程。

**多独立包**（`checkPackageUncommittedForMulti`）：

- 对每个非 `private` 包在其 **包目录** 检查未提交文件；收集脏包列表后交互四选一：
  - **skip**：从待发布列表移除这些包；
  - **reset**：对脏包目录 `resetGit`（`git add -A` + `git reset --hard`）；
  - **ignore**：继续；
  - **abort**：中止发版。

### 3. 选择包与计算版本

1. `filterReleasePackages`：排除 `private: true`，checkbox 多选包名。
2. `getNewVersions`：对每个包调用 `askForNextVersion`（列表展示 `curr ==> next` 预览，支持 custom 输入）。
3. 用户取消或非法版本 → 该分支返回 `false`。

### 4. 多独立包分支 `releaseMultiPackages` → `releasePackageForMulti`

1. 完成检查与版本计算后，若非 `--force`，二次 checkbox 确认要实际发布的包（展示 `old => new`）。
2. `updateVersions`：并行写回各包 manifest 与依赖引用，执行 `updateVersion:post`。
3. **按包**循环（各自 Git 根）：
   - `installPnpm(cwd)`；
   - 无未提交变更 → 报错跳过该包；
   - `addGit` → `commitGit`（`chore: release package <version>`）；
   - `--push` 时 `pushGit`。

### 5. Monorepo 分支 `releaseMonrepoPackage` → `releasePackageForMonrepo`

1. 在根的 `children` 上执行 `filterReleasePackages`（非 private 子包）。
2. `getNewVersions` 得到子包版本映射。
3. 非 `--force` 时 confirm 汇总（`name: old => new`）。
4. `updateVersions` 写回各子包 manifest。
5. 在 **monorepo 根目录** 统一：`installPnpm` → `addGit` → `commitGit`（`chore: release packages` + 列表）→ 可选 `pushGit`。

### 6. 写回规则（`updateVersions`）

- 仅处理 `PACKAGE_DEPENDENCY_KEYS`（`dependencies` / `devDependencies` / `peerDependencies`）。
- 依赖值为 `workspace:` 前缀的不改。
- 若依赖名恰为本次 bump 的包名（`versions[key]` 存在），则将该依赖版本改为该包的 **新版本号**（精确版本，非 range）。

## 行为要点

- **multi 与 mono 可同次运行**：例如工作区既有并列独立仓又有 monorepo 根，会分别走两套流程并各有一条 Report。
- **`--force` 范围**：不跳过「选择要发布的包」（`filterReleasePackages`）；仅跳过 monorepo 的 bump 确认，或多仓的二次发布确认。
- **提交粒度**：多仓 = 每个包仓库一次 commit；monorepo = 根仓库一次 commit 涵盖所有选中子包版本变更。
- **预发版**：当前版本含 prerelease 时，交互列表会增加 `premajor` / `preminor` / `prepatch` / `prerelease`，并与 `semver.prerelease` 标识符对齐 `semver.inc`。

## 示例

```bash
jshow release
jshow release ./packages
jshow release --check -t patch
jshow release --force              # 跳过 bump/二次发布确认（仍会先选包）
jshow release --push false         # 只提交不推送
```
