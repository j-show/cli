# backup 命令

实现：`src/built-in/commands/backup.cmd.ts`  
注册：`src/built-in/commands/index.ts` 的 `BUILT_IN_COMMANDS`（随 `initBuiltIn` 默认加载）。

## 功能

- 在指定**输入目录**下解析待备份目标：优先用 `getGroupPackages` 识别工作区包；无有效 `package.json` 工作区时，回退为递归扫描含 `.git` 的仓库根（深度上限 3）。
- **Monorepo**：若根包带 `children`，则备份各**子包**目录，而非 monorepo 根本身。
- **多独立包**：每个含 `package.json` 的并列目录各视为一个备份单元。
- 对每个目标：若目录下存在 `.git`，先执行 `pullCurrentBranch`（`git pull --rebase`，并 `git fetch --all --prune`）；再将包根目录**下一级**条目复制到输出目录下以包名命名的子文件夹。
- 复制时默认跳过 `node_modules`；`-c` / `--clean` 为真时额外跳过源侧的 `.git`（输出目录不会包含 `.git`）。
- `-f` / `--filter`：按**包名**（`manifest.name` 或 Git 回退时的目录 basename）过滤，模式由 `toPatterns` 解析（逗号分隔，支持正则字面量）。

## 命令行

| 项 | 说明 |
| --- | --- |
| 位置参数 `input` | 扫描根目录（必填） |
| 位置参数 `output` | 备份输出根目录，默认 `../backup` |
| `-c, --clean` | 复制时排除 `.git`，默认 `true` |
| `-f, --filter` | 逗号分隔的包名过滤模式（`toPatterns`），不匹配则跳过该包 |

## 逻辑顺序

### 1. 入口 `execute`

1. 解析 `input`、`output` 为绝对路径，打印起始日志（相对 cwd 的路径）。
2. `getGroupPackages(inputRoot)` → `getInputPackages`（展开目标 + 可选 filter）。
3. 若无任何待备份包 → `logger.error` 并 `process.exit(1)`。
4. 若 `getGroupPackages` 结果为空但仍有 Git 回退目标 → `warn` 提示按 Git 仓库备份。
5. 组装复制排除列表：`['node_modules']`，`clean` 为真时追加 `'.git'`。
6. 对每个包在 `logger.scope({ namespace: item.name })` 内顺序执行 `fetchPackage` → `copyPackage`（单包 pull/copy 失败不阻断后续包）。
7. 打印 `Completed`。

### 2. 解析备份目标（`resolveBackupTargets` / `getInputPackages`）

1. 遍历 `getGroupPackages` 返回的每组：`children.length > 0` 时收集所有子包，否则收集该组自身。
2. 若上述列表为空 → `discoverGitPackages(inputRoot)`：自根向下找含 `.git` 的目录，命中后不再深入（避免子模块/嵌套仓重复）。
3. `filterPatterns` 非空时，仅保留 `name` 匹配任一正则的包。

### 3. 拉取（`fetchPackage`）

1. 包目录下无 `.git` → 直接返回（仅复制，不拉取）。
2. 有 `.git` → `pullCurrentBranch(true, pkgRoot, verbose)`；异常时写 `Failed to fetch`，**不**中断整次 backup。

### 4. 复制（`copyPackage`）

1. 输出路径：`outputRoot / basename(pkgRoot)`，先 `mkdirSync`。
2. `eachDirSync` 遍历包根**一级**子项；名称在 `filterNames` 中的跳过。
3. 对其余项 `cpSync(src, dest)`（目录会递归复制；因已排除顶层 `node_modules`，不会整棵复制依赖树）。

## 行为要点

- **与 upgrade/release 不同**：backup **允许**同一输入下同时存在 monorepo 子包与独立包目录（按 `getGroupPackages` 自然展开，不做「二选一」校验）。
- **filter 作用对象**：包名，不是文件路径；示例中的 `*.test.ts` 仅当包名能匹配该模式时生效。
- **pull 非可选**：只要检测到 Git 仓库就会尝试拉取，无 `--no-fetch` 开关。
- **输出布局**：多个包备份到同一 `output` 下并列子目录，目录名取自源包文件夹 basename。

## 示例

```bash
jshow backup ./code ./code_backup
jshow backup ./core ./core_backup -c
jshow backup ./workspace ./out -f "pkg-a,pkg-b"
jshow backup ./repos ./mirror --clean false   # 输出中保留 .git（仍跳过 node_modules）
```
