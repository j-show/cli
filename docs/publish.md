# publish 命令

实现：`src/built-in/commands/publish.cmd.ts`  
注册：`src/built-in/commands/index.ts` 的 `BUILT_IN_COMMANDS`（随 `initBuiltIn` 默认加载）。

## 功能

- 在指定目录发布**单个** npm 包（非 private）。
- 发布前改写 `package.json`：
  - 移除 `devDependencies`；
  - 将 `dependencies` / `peerDependencies` / `optionalDependencies` 及 `pnpm.overrides` 中的 `workspace:`、`catalog:` 协议解析为可发布的 semver 字符串。
- 执行 `npm publish --no-git-checks`；scoped 包（`@scope/name`）自动附加 `--access public`。
- 面向 CI 场景：改写后的 `package.json` 会保留在磁盘上，不恢复原始内容。

## 命令行

| 项 | 说明 |
| --- | --- |
| 位置参数 `input` | 待发布包根目录，默认 `.` |

## 版本解析

1. `findPnpmWorkspaceRoot` 自包目录向上查找 `pnpm-workspace.yaml`（默认最多 3 层）；未找到则以 `input` 为 workspace 根。
2. `getWorkspacePackages` 收集工作区内包名 → 版本，用于解析 `workspace:` / `workspace:^` / `workspace:~`。
3. `readPnpmCatalogs` 读取 catalog 映射，用于解析 `catalog:` / `catalog:组名`。

无法解析的 workspace/catalog 依赖会抛错并 `process.exit(1)`。

## 示例

```bash
jshow publish
jshow publish ./packages/core
```
