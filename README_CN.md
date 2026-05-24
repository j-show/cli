<p align="center">
  <a href="https://jshow.org" target="_blank">
    <img width="100" src="https://jshow.org/images/jshow.png" alt="jShow logo" />
  </a>
</p>

<h1 align="center">@jshow/cli</h1>

<p align="center">
  <a href="./README.md">English</a> | 简体中文
</p>

---

## 概述

`@jshow/cli` 是 `jShow` 的命令行工具集，基于 [commander](https://www.npmjs.com/package/commander) 开发。它提供了一个强大且可扩展的 CLI 框架，支持自动命令发现、插件系统和完整的 TypeScript 支持。

CLI 会自动扫描并加载项目中的命令文件（`.cmd.ts` 或 `.cmd.js`）和插件文件（`.plugin.ts` 或 `.plugin.js`），让你能够以最少的配置构建自定义 CLI 工具。

---

## 功能特性

| 功能 | 描述 |
| --- | --- |
| **自动命令发现** | 自动扫描并加载项目中的命令文件（`.cmd.ts` 或 `.cmd.js`） |
| **插件系统** | 支持插件系统，提供生命周期钩子（beforeExecute、afterExecute） |
| **命令注册系统** | 支持自定义命令注册，方便根据项目需求扩展命令 |
| **类型安全** | 完整的 TypeScript 类型支持 |
| **Commander 导出** | 导出整个 `commander` 库，方便开发者直接使用 |
| **命令基类** | 提供 `BaseCommand` 抽象基类，简化命令开发 |
| **命令分组** | 支持命令分组，帮助信息按分组显示 |
| **工作区与 Git 工具** | 从包入口再导出 `getGroupPackages`、Git 封装、`execSync` 等，供发版/备份或自建工具链使用 |

---

## 环境要求

- **Node.js**：建议使用 18+（本库面向现代 Node 与 ESM）。
- **pnpm**：在本仓库开发时需 **>=10**（见 `package.json` 的 `engines`）。
- **TypeScript**：运行时可选；`bin/cli.mjs` 会通过 `ts-node/esm` 加载工作区内的 `.cmd.ts` / `.plugin.ts`。

---

## 为什么选择 @jshow/cli？

- **零配置** – 自动发现并加载项目中的命令/插件，无需手动注册。
- **类型安全** – 完整的 TypeScript 支持，为命令、插件和选项提供全面的类型定义。
- **可扩展** – 插件系统允许你添加横切关注点，如日志记录、计时和错误处理。
- **Commander 集成** – 基于 Commander.js 构建，导出整个库以支持高级用例。
- **开发者友好** – 简单的基类和清晰的约定，使创建和维护命令变得容易。
- **现代工具** – 为现代 Node.js 构建，支持 ESM 和 TypeScript 优先设计。

---

## 快速开始

1. **安装依赖**

   ```bash
   pnpm add @jshow/cli
   # 或
   npm install @jshow/cli
   # 或
   yarn add @jshow/cli
   ```

2. **创建命令文件**

   在项目中创建以 `.cmd.ts` 或 `.cmd.js` 结尾的文件：

   ```typescript
   // example.cmd.ts
   import { BaseCommand, type CommandContext } from '@jshow/cli';

   export default class ExampleCommand extends BaseCommand {
     static name = 'example';
     static force = false;

     public get args() {
       return {
         name: 'example',
         description: '这是一个示例命令',
         aliases: ['ex', 'e'],
         group: 'examples',
         plugins: ['logger', 'timer'], // 可选：指定要使用的插件
         options: [
           {
             name: 'name',
             abbr: 'n',
             flagValue: true,
             description: '名称参数',
             defaultValue: 'world',
             required: false,
           },
         ],
         examples: [
           'jshow example',
           'jshow example --name "jshow"',
           'jshow ex -n "test"',
         ],
         validate: (options) => {
           // 可选：自定义验证
           if (options.name && typeof options.name !== 'string') {
             return '名称必须是字符串';
           }
           return null;
         },
       };
     }

     public async beforeExecute(context: CommandContext): Promise<void> {
       console.log(`开始执行命令: ${context.name}`);
     }

     public async execute(context: CommandContext): Promise<void> {
       const { options } = context;
       console.log(`Hello, ${String(options.name || 'world')}!`);
     }

     public async afterExecute(context: CommandContext): Promise<void> {
       console.log(`命令执行完成，耗时: ${Date.now() - context.startTime}ms`);
     }
   }
   ```

3. **运行命令**

   ```bash
   # 开发模式（在包根目录执行，进入 src 用 ts-node 跑 cli.ts）
   pnpm start

   # 构建后执行（通过包内 bin 加载 dist/cli.mjs；需要时会启用 ts-node loader）
   pnpm build
   pnpm exec jshow example --name "jshow"
   # 若全局已安装 jshow：jshow example --name "jshow"
   ```

---

## 作为库使用

在自有 Node 程序中组合框架，而不依赖 cwd 自动扫描时：

```typescript
import { CommandProgram, initBuiltIn, BaseCommand, type CommandContext } from '@jshow/cli';

class DeployCommand extends BaseCommand {
  static key = 'deploy';
  protected get args() {
    return { name: 'deploy', description: 'Deploy service' };
  }
  async execute(ctx: CommandContext) {
    console.log(ctx.options);
  }
}

CommandProgram.use(DeployCommand);
await initBuiltIn(CommandProgram).run();
```

- 包入口再导出 `commander` 全部 API、`./utils` 工具与 `logger`，详见下文「工具函数」。
- **`runjShow` / `dist/cli.mjs` 未从主入口导出**；需要完整自动发现流程时请使用 `bin` 或 `import` 构建后的 CLI 入口。

---

## 仓库脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm build` | 清理 `dist/`、`out/` 后执行 `vite build`（库 + `cli` 入口，产出 `dist/*.mjs` / `*.cjs`） |
| `pnpm test` | 运行 `vitest --run` |
| `pnpm start` | `cd src && ts-node ./cli.ts`，以当前工作区为扫描根开发调试 CLI |
| `pnpm cli` | 在 `test/fixtures/empty-cli-cwd` 下执行 `bin/cli.mjs`（可用 `pnpm cli -- --help` 传参） |
| `pnpm clean` | `rm -rf ./dist && rm -rf ./out`（Unix）；Windows 若无 `rm` 需手动删目录或用 Git Bash |
| `pnpm fix:all` | Prettier + ESLint 自动修复 |

---

## 环境变量

| 变量 | 使用位置 | 说明 |
| --- | --- | --- |
| `JSHOW_CLI_MAX_DEPTH` | `src/cli.ts` | 在 `process.cwd()` 下扫描 `.cmd` / `.plugin` 的最大目录深度（按整数解析，最小为 `2`）。 |
| `JSHOW_CLI_IGNORE_NAMES` | `src/cli.ts` | 逗号分隔的**顶层目录名**，扫描时跳过（例如在 monorepo 中排除其它子工程）。 |
| `JSHOW_CLI_TS_RUNTIME` | `src/cli.ts` | 设为 `1` 时视为 ts-node 环境，发现阶段可加载 `.cmd.ts` / `.plugin.ts`。 |
| `JSHOW_CLI_NO_TS_LOADER` | `bin/cli.mjs` | 设为 `1` 时不通过 ts-node loader 启动 `dist/cli.mjs`（不会加载工作区 `.ts` 发现文件）。 |
| `TS_NODE_PROJECT` / `TS_NODE_COMPILER_OPTIONS` / `execArgv` 含 `ts-node` | `src/cli.ts`、`bin/cli.mjs` | 满足 ts-node 相关环境时才加载 `.ts` 发现文件；否则只加载 `.js`。 |

---

## 示例

`examples/` 目录包含可运行的示例：

### TypeScript 示例

- `hello.cmd.ts` – 一个简单的 Hello World 命令，演示基本命令结构
- `greet.cmd.ts` – 一个带选项、别名和验证的命令
- `build.cmd.ts` – 一个使用插件和命令分组的复杂命令

### CommonJS 示例

- `hello.cmd.js` – 使用 CommonJS 语法的基本命令示例
- `build.cmd.js` – 使用 CommonJS 语法的带插件命令示例

### 插件示例

- `logger.plugin.ts` – 一个带生命周期钩子的日志插件（优先级：50）
- `timer.plugin.ts` – 一个用于性能监控的计时插件（优先级：100）
- `error-handler.plugin.ts` – 一个错误处理插件示例（优先级：200）

详细使用说明请参见 [`examples/README.md`](./examples/README.md)。

---

## 内置命令

由 `initBuiltIn(CommandProgram)` 在 `CommandProgram.run()` 之前默认注册：

- **`release`**：交互选择待发布的非 private 包、`semver` bump、`pnpm install`、`git add` / `git commit -F`、可选 `git push`（多独立仓与 monorepo 可同次执行）；结束时 **Report** 表含 `status` 与 `count`（实际选中包数）。详见 [`docs/release.md`](./docs/release.md)。
- **`publish`**：校验并发布**单个** npm 包：移除 `devDependencies`、解析 `workspace:` / `catalog:` 后执行 `npm publish`（面向 CI，保留改写后的 `package.json`）。详见 [`docs/publish.md`](./docs/publish.md)。
- **`backup`**：用 `getGroupPackages` 解析包（无 manifest 时回退扫描 `.git` 仓），可选 `git pull`，再将包目录一级内容复制到输出目录（默认跳过 `node_modules`，`-c` 可排除 `.git`）。详见 [`docs/backup.md`](./docs/backup.md)。
- **`upgrade`**：扫描工作区依赖、多选待查询的依赖名后拉取 registry 版本，按 manifest 字段交互确认 bump，写回 `package.json` 并 `pnpm install`，可选 Git 提交与推送（多独立包与 monorepo 不可混扫）。`--force` 跳过提交/推送确认。详见 [`docs/upgrade.md`](./docs/upgrade.md)（`--local` 待接）。

实现目录：`src/built-in/commands/`。

---

## 工具函数（`utils` 再导出）

自 `@jshow/cli` 引入，与内置 `release` / `backup` 共用实现：

| 分类 | 符号 | 用途 |
| --- | --- | --- |
| 工作区 | `getGroupPackages`, `getWorkspacePackages`, `separateGroupPackages` | 扫描 monorepo / 多包目录 |
| 文件系统 | `existsSync`, `readJsonSync`, `writeJsonSync`, `execSync`, `cpSync`, … | 安全读写与同步子进程 |
| Git | `getCurrentBranch`, `pullCurrentBranch`, `getUnCommittedFiles`, `diffGit`, `addGit`, `commitGit`, `pushGit`, … | 发版/升级/备份常用 Git 封装 |
| pnpm | `installPnpm`, `readPnpmCatalogs`, `findPnpmWorkspaceRoot`, `PNPM_BUILT_IN_WORKSPACE`, `PNPM_BUILT_IN_CATALOG` | 安装依赖、catalog 读取、向上查找 workspace 根、内置前缀常量 |
| 交互 | `confirmInquirer`, `inputInquirer`, `checkboxInquirer`, … | 动态加载 inquirer 的 CLI 提示封装 |
| 终端 | `red`, `green`, `yellow` | ANSI 颜色辅助 |
| 正则 | `toRegExp`, `toPatterns` | 逗号分隔过滤模式（如 `backup -f`、`upgrade -i`） |

完整列表见 `src/utils/index.ts` 与各子模块 JSDoc。

---

## API 文档

### 包入口（`@jshow/cli`）

发布的 `"."` 导出包含：`commander` 的全部导出、`CommandProgram`、`initBuiltIn`、`BaseCommand` / `BasePlugin` 与相关类型、`isCommand` / `isPlugin`、**`./utils` 下的全部工具符号**，以及共享的 `logger`。可执行 CLI 为独立构建目标 `dist/cli.mjs`（由 `bin/cli.mjs` 启动）；**主入口不导出** `runjShow`，避免误 `import '@jshow/cli'` 即启动交互进程。

### CommandProgram

单例式门面：持有 Commander 根 `program`、插件列表与命令注册表。

#### 静态属性

- `version: string` — 从与构建产物相邻的本包 `package.json` 读取。
- `program: Command` — Commander 根实例；子命令在 `run()` 中挂载。

#### 静态方法

##### `use(command: CommandClassType, force?: boolean): typeof CommandProgram`

注册命令类。注册键优先取 `command.key`，否则取 `command.name`（注意：`static name = 'foo'` 会覆盖 `Function.name`）。

##### `install(plugin: PluginClassType, force?: boolean): typeof CommandProgram`

安装插件类；实例按 `priority` **升序**排序（数值越小越早执行钩子）。

##### `reset(autoRun?: boolean): void`

清空插件/命令并重建根 `Command`（主要用于测试；`autoRun === true` 时可立即再走内置初始化）。

##### `run(): Promise<void>`

为未实例化的命令补全子命令、增强帮助文案，并 `await program.parseAsync(process.argv)`。

### `initBuiltIn`

`initBuiltIn(CommandProgram)` 安装默认插件并注册内置命令（`release`、`publish`、`backup`、`upgrade`），返回 `CommandProgram` 以支持链式调用。


### CommandArgs

命令参数配置接口。

#### 属性

- `name: string` - 命令名称（必需）
- `description?: string` - 命令描述
- `aliases?: string[]` - 命令别名
- `plugins?: string[]` - 该命令使用的插件名称列表
- `group?: string` - 命令分组，用于帮助信息组织
- `arguments?: CommandArgument[]` — 位置参数（对应 `command.argument(...)`）
- `options?: CommandOption[]` — 选项（对应 `command.option(...)`）
- `examples?: string[]` - 使用示例
- `validate?: (options: Record<string, unknown>) => string | null` - 可选的验证函数，返回错误信息或 null

### CommandOption

命令选项配置接口。

#### 属性

- `name: string` - 长选项名（会作为 `--${name}`），例如：`'name'` 或 `'verbose'`
- `abbr?: string` - 短选项名（单字符），例如：`'n'` 对应 `-n`
- `flagValue?: boolean` - 为 `true` 时在 Commander 中声明为带占位参数的长选项（如 `--output <dir>`）；为 `false` 时为布尔开关
- `description?: string` - 选项描述
- `defaultValue?: T` - 选项的默认值
- `required?: boolean` - 选项是否必填（默认：`false`）
- `variadic?: boolean` - 是否支持多值（会生成 `--name <value...>`）

### BaseCommand

命令基类，所有自定义命令都应继承此类。

#### 静态属性

- `static key: string` — 推荐注册键（默认 `''`；自动加载时可能由文件名补全）。
- `static force: boolean` — 是否允许覆盖已存在注册（默认 `false`）。
- `static name = 'subcommand'` — 可选；覆盖 `Function.name`，在 `key` 为空时可作注册键。

#### 实例属性

- `key`（getter）：`static key` → 构造函数 `name` → `args.name`。
- `command: Command` - Commander 命令实例（受保护）

#### 抽象方法

##### `execute(context: CommandContext): Promise<void>`

命令执行逻辑，子类必须实现此方法。

#### 受保护方法

##### `get args(): CommandArgs`

获取命令参数配置，子类必须实现此 getter。

`CommandArgs` 接口包括：
- `name: string` - 命令名称
- `description?: string` - 命令描述
- `aliases?: string[]` - 命令别名
- `plugins?: string[]` - 该命令使用的插件名称列表
- `group?: string` - 命令分组，用于帮助信息组织
- `arguments?` / `options?` — 同上
- `examples?: string[]` - 使用示例
- `validate?: (options: Record<string, unknown>) => string | null` - 可选的验证函数

##### `beforeExecute?(context: CommandContext): Promise<void>`

命令执行前生命周期钩子。

##### `afterExecute?(context: CommandContext): Promise<void>`

命令执行后生命周期钩子。

##### `onError(error: Error, context: CommandContext): boolean`

错误处理钩子。如果错误已被处理返回 `true`，否则返回 `false`。

### BasePlugin

插件基类，所有自定义插件都应继承此类。

#### 静态属性

- `static key: string` — 注册键（默认 `''`）。
- `static force: boolean` — 是否允许覆盖已存在插件。

#### 实例属性

- `key`（getter）：`static key` 或构造函数 `name`。
- `priority: number` - 插件优先级（默认：100，数字越小优先级越高）

#### 方法

##### `beforeExecute?(context: CommandContext): Promise<void>`

命令执行前生命周期钩子。

##### `afterExecute?(context: CommandContext): Promise<void>`

命令执行后生命周期钩子。

---

## 文件命名规范

### 命令文件

#### TypeScript 文件

1. **文件命名**：必须以 `.cmd.ts` 结尾
2. **默认导出**：必须使用 `export default` 导出命令类
3. **继承基类**：命令类必须继承 `BaseCommand`
4. **静态标识**：设置 `static key` 和/或 `static name`（与 `CommandProgram.use` 配合）；自动加载且缺省时用文件名写入 `key`
5. **实现方法**：必须实现 `execute(context)` 方法和 `args` getter

#### CommonJS 文件

1. **文件命名**：必须以 `.cmd.js` 结尾
2. **导入依赖**：使用 `require()` 导入：`const { BaseCommand } = require('@jshow/cli');`
3. **导出类**：使用 `module.exports` 导出类（Node.js 会自动将其作为 default 导出）
4. **继承基类**：命令类必须继承 `BaseCommand`
5. **静态标识**：设置 `static key` 和/或 `static name`
6. **实现方法**：必须实现 `execute(context)` 方法和 `args` getter

### 插件文件

#### TypeScript 文件

1. **文件命名**：必须以 `.plugin.ts` 结尾
2. **默认导出**：必须使用 `export default` 导出插件类
3. **继承基类**：插件类必须继承 `BasePlugin`
4. **静态标识**：设置 `static key` 和/或 `static name`

#### CommonJS 文件

1. **文件命名**：必须以 `.plugin.js` 结尾
2. **导入依赖**：使用 `require()` 导入：`const { BasePlugin } = require('@jshow/cli');`
3. **导出类**：使用 `module.exports` 导出类（Node.js 会自动将其作为 default 导出）
4. **继承基类**：插件类必须继承 `BasePlugin`
5. **静态标识**：设置 `static key` 和/或 `static name`

---

## 命令自动发现

CLI 会自动扫描当前工作目录及其子目录，查找所有 `.cmd.ts`、`.cmd.js`、`.plugin.ts` 或 `.plugin.js` 文件并自动加载。

**扫描规则**
- 自 `process.cwd()` 递归，最大深度为 `JSHOW_CLI_MAX_DEPTH`（默认 `2`，最小 `2`）。
- 跳过点开头的目录、`isIgnoreDir` 中的常见目录、`JSHOW_CLI_IGNORE_NAMES` 中的顶层目录名，以及扫描路径下与包内 `built-in/commands` 重合的目录树。
- 仅加载后缀为 `.cmd.ts`、`.cmd.js`、`.plugin.ts`、`.plugin.js` 的文件。
- 仅在检测到 ts-node 相关环境时才考虑 `.ts`；否则只加载 `.js`。
- 若类未设置 `static key`，会用文件名（去掉 `.cmd` / `.plugin`）写入 `key` 再注册。

---

## 开发说明

- **库与 CLI 分工**：`import '@jshow/cli'` 使用 `CommandProgram` / `BaseCommand` / `utils`；执行 `jshow`（或在本仓库 `pnpm start`）才会扫描 cwd。实现入口：`src/index.ts`（库）、`src/cli.ts` → `dist/cli.mjs`（CLI）。`src/cli.ts` 导出 `runjShow` 供测试或二次封装，**不**从包主入口再导出。
- **命令发现**：工作区内 `.cmd` / `.plugin` 加载失败仅 `warn`，不阻断 `--help` 与内置命令（见 `loadCommand` / `loadPlugin`）。
- **布尔选项 `invert`**：在 `CommandOption` 上对 `flagValue: false` 的开关可设 `invert: true`，框架会额外注册 `--no-<name>`（内置 `backup -c`、`release --check` / `--push` 等）；语义见 `src/command.ts` 的 `initOption`。
- **内置命令**：在 `src/built-in/commands/index.ts` 注册；行为细节见 `docs/*.md`，摘要见本文「内置命令」。
- **JSDoc**：`src/` 下公共与内部辅助函数均在源码旁维护文档，API 细节以 JSDoc 为准，本文不重复罗列每个符号。

---

## 开发工作流

1. `pnpm install` – 安装依赖
2. 在项目中创建命令文件（`.cmd.ts` 或 `.cmd.js`）或插件文件（`.plugin.ts` 或 `.plugin.js`）
3. `pnpm start` – 在开发模式下运行
4. `pnpm build` – 构建生产版本
5. 使用 `jshow <command>` 测试你的命令

---

## 目录结构

```
├── bin/cli.mjs         # 发布入口：Node + ts-node loader → dist/cli.mjs
├── src/
│   ├── cli.ts          # 可执行 CLI（扫描 cwd、initBuiltIn、parseAsync）
│   ├── index.ts        # 库入口（commander + 框架 + utils + logger）
│   ├── command.ts      # BaseCommand 与选项/参数类型
│   ├── plugin.ts       # BasePlugin
│   ├── program.ts      # CommandProgram、initBuiltIn
│   ├── logger.ts       # 共享 logger fork
│   ├── built-in/       # initBuiltIn 注册的默认命令/插件
│   └── utils/          # 工作区扫描、git、pnpm、fs 等
├── test/               # Vitest 与 fixtures（不参与包发布）
├── docs/               # 内置命令说明（backup / publish / release / upgrade）
├── examples/           # 示例 .cmd / .plugin
├── scripts/            # 开发辅助脚本（如 run-cli-help.mjs）
├── dist/               # Vite 构建输出（通常 gitignore）
└── ...
```

---

## 许可证

[MIT](./LICENSE) © jShow

---

有问题或建议？请在 <https://github.com/j-show/cli/issues> 提交 issue。
