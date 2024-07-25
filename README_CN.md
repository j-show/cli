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
   import { BaseCommand, CommandContext } from '@jshow/cli';

   export default class ExampleCommand extends BaseCommand {
     static name = 'example';
     static force = false;

     protected get args() {
       return {
         name: 'example',
         description: '这是一个示例命令',
         aliases: ['ex', 'e'],
         group: 'examples',
         options: [
           {
             flag: '--name <value>',
             abbreviation: '-n',
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
       };
     }

     protected beforeExecute(context: CommandContext): void {
       console.log(`开始执行命令: ${context.name}`);
     }

     public execute(): void {
       const options = this.command.opts();
       console.log(`Hello, ${options.name || 'world'}!`);
     }

     protected afterExecute(context: CommandContext): void {
       console.log(`命令执行完成，耗时: ${Date.now() - context.startTime}ms`);
     }
   }
   ```

3. **运行命令**

   ```bash
   # 开发模式
   pnpm start

   # 或构建后运行
   pnpm build
   jshow example --name "jshow"
   ```

---

## 仓库脚本

| 命令 | 描述 |
| --- | --- |
| `pnpm build` | 构建库和 CLI 入口点，输出到 `dist/` |
| `pnpm build:lib` | 仅构建库包 |
| `pnpm build:cli` | 仅构建 CLI 入口点 |
| `pnpm start` | 使用 ts-node 在开发模式下运行 CLI |
| `pnpm clean` | 删除构建输出（`dist/` 和 `out/` 目录） |

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

## API 文档

### CommandProgram

命令程序管理器，负责命令的注册和运行。

#### 静态属性

- `version: string` - CLI 版本号
- `program: Command` - Commander 程序实例

#### 静态方法

##### `use(command: CommandClass, force?: boolean): CommandProgram`

注册一个命令类。

**参数：**
- `command: CommandClass` - 命令类（继承自 `BaseCommand`）
- `force?: boolean` - 如果命令已存在，是否强制覆盖（默认：`false`）

**返回：** `CommandProgram` 实例（支持链式调用）

##### `install(plugin: PluginClass, force?: boolean): CommandProgram`

安装一个插件。

**参数：**
- `plugin: PluginClass` - 插件类（继承自 `BasePlugin`）
- `force?: boolean` - 如果插件已存在，是否强制覆盖（默认：`false`）

**返回：** `CommandProgram` 实例（支持链式调用）

##### `run(): void`

运行 CLI 程序，解析命令行参数并执行相应的命令。

### BaseCommand

命令基类，所有自定义命令都应继承此类。

#### 静态属性

- `name: string` - 命令名称（必需）
- `force: boolean` - 是否强制覆盖同名命令（默认：`false`）
- `plugins: string[]` - 该命令使用的插件名称列表

#### 实例属性

- `name: string` - 获取命令名称（只读）
- `command: Command` - Commander 命令实例（受保护）

#### 抽象方法

##### `execute(): void`

命令执行逻辑，子类必须实现此方法。

#### 受保护方法

##### `get args(): CommandArgs`

获取命令参数配置，子类必须实现此 getter。

##### `beforeExecute?(context: CommandContext): void`

命令执行前生命周期钩子。

##### `afterExecute?(context: CommandContext): void`

命令执行后生命周期钩子。

##### `onError(error: Error, context: CommandContext): boolean`

错误处理钩子。如果错误已被处理返回 `true`，否则返回 `false`。

### BasePlugin

插件基类，所有自定义插件都应继承此类。

#### 静态属性

- `name: string` - 插件名称（必需）
- `force: boolean` - 是否强制覆盖同名插件（默认：`false`）

#### 实例属性

- `name: string` - 获取插件名称（只读）
- `priority: number` - 插件优先级（默认：100，数字越小优先级越高）

#### 方法

##### `beforeExecute?(context: CommandContext): void`

命令执行前生命周期钩子。

##### `afterExecute?(context: CommandContext): void`

命令执行后生命周期钩子。

---

## 文件命名规范

### 命令文件

#### TypeScript 文件

1. **文件命名**：必须以 `.cmd.ts` 结尾
2. **默认导出**：必须使用 `export default` 导出命令类
3. **继承基类**：命令类必须继承 `BaseCommand`
4. **静态属性**：必须设置 `static name` 属性
5. **实现方法**：必须实现 `execute()` 方法和 `args` getter

#### CommonJS 文件

1. **文件命名**：必须以 `.cmd.js` 结尾
2. **导入依赖**：使用 `require()` 导入：`const { BaseCommand } = require('@jshow/cli');`
3. **导出类**：使用 `module.exports` 导出类（Node.js 会自动将其作为 default 导出）
4. **继承基类**：命令类必须继承 `BaseCommand`
5. **静态属性**：必须设置 `static name` 属性
6. **实现方法**：必须实现 `execute()` 方法和 `args` getter

### 插件文件

#### TypeScript 文件

1. **文件命名**：必须以 `.plugin.ts` 结尾
2. **默认导出**：必须使用 `export default` 导出插件类
3. **继承基类**：插件类必须继承 `BasePlugin`
4. **静态属性**：必须设置 `static name` 属性

#### CommonJS 文件

1. **文件命名**：必须以 `.plugin.js` 结尾
2. **导入依赖**：使用 `require()` 导入：`const { BasePlugin } = require('@jshow/cli');`
3. **导出类**：使用 `module.exports` 导出类（Node.js 会自动将其作为 default 导出）
4. **继承基类**：插件类必须继承 `BasePlugin`
5. **静态属性**：必须设置 `static name` 属性

---

## 命令自动发现

CLI 会自动扫描当前工作目录及其子目录，查找所有 `.cmd.ts`、`.cmd.js`、`.plugin.ts` 或 `.plugin.js` 文件并自动加载。

**扫描规则：**
- 从 `process.cwd()` 开始递归扫描
- 只加载以 `.cmd.ts`、`.cmd.js`、`.plugin.ts` 或 `.plugin.js` 结尾的文件
- 自动从文件名提取命令/插件名称（去除 `.cmd` 或 `.plugin` 后缀）

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
├── src/
│   ├── cli.ts          # CLI 入口点
│   ├── command.ts      # 命令基类和类型
│   ├── plugin.ts       # 插件基类和类型
│   ├── program.ts      # 命令程序管理器
│   └── index.ts        # 主导出
├── examples/           # 示例命令和插件
├── scripts/            # 构建脚本
├── dist/               # 构建输出（gitignored）
└── ...
```

---

## 许可证

[MIT](./LICENSE) © jShow

---

有问题或建议？请在 <https://github.com/j-show/cli/issues> 提交 issue。
