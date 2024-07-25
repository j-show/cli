# 示例代码

本目录包含了 `@jshow/cli` 的使用示例。

## 命令示例

### TypeScript 示例

#### hello.cmd.ts

最简单的命令示例，演示如何创建一个基本的命令。

**运行方式：**
```bash
jshow hello
# 或使用别名
jshow hi
```

#### greet.cmd.ts

带选项的命令示例，演示如何：
- 定义命令选项
- 使用选项的默认值
- 参数验证
- 生命周期钩子

**运行方式：**
```bash
jshow greet
jshow greet --name "Alice"
jshow greet -n "Bob" --formal
jshow greet -n "Charlie" -t 3
```

#### build.cmd.ts

构建命令示例，演示如何：
- 使用命令分组
- **使用插件**（通过 `static plugins = ['logger', 'timer']` 声明）
- 复杂的选项配置
- 错误处理

**运行方式：**
```bash
jshow build
jshow build --watch
jshow build -m development -o ./output
```

### CommonJS 示例

#### hello.cmd.js

使用 CommonJS 语法创建的基本命令示例。

**特点：**
- 使用 `require()` 导入依赖
- 使用 `module.exports` 导出类（Node.js 会自动将其作为 default 导出）

**运行方式：**
```bash
jshow hello
```

#### build.cmd.js

使用 CommonJS 语法创建的带插件命令示例。

**特点：**
- 演示如何在 CommonJS 中使用插件
- 通过 `static plugins = ['logger', 'timer']` 声明使用的插件
- 完整的选项配置和错误处理

**运行方式：**
```bash
jshow build
jshow build --watch
jshow build -m development -o ./output
```

## 插件示例

插件是扩展命令功能的重要方式。插件可以在命令执行前后执行自定义逻辑，如日志记录、性能监控、错误处理等。

### 如何在命令中使用插件

在命令类中通过 `static plugins` 属性声明要使用的插件：

```typescript
// TypeScript
export default class BuildCommand extends BaseCommand {
  static plugins = ['logger', 'timer']; // 声明使用的插件
  // ...
}
```

```javascript
// CommonJS
class BuildCommand extends BaseCommand {
  static plugins = ['logger', 'timer']; // 声明使用的插件
  // ...
}
```

插件会按照优先级顺序执行，优先级数字越小，执行越早。

### 插件列表

#### logger.plugin.ts

日志插件，用于记录命令执行的详细信息，包括：
- 执行时间戳
- 命令名称
- 命令参数
- 执行耗时

**优先级：** 50（较高优先级，优先执行）

#### timer.plugin.ts

计时器插件，用于统计命令执行时间，并以友好的方式显示。

**优先级：** 100（中等优先级）

#### error-handler.plugin.ts

错误处理插件示例，演示如何创建用于监控和处理的插件。该插件会监控命令执行时间，对执行时间过长的命令发出警告。

**优先级：** 200（较低优先级，最后执行）

### 插件执行顺序

当命令使用多个插件时，插件会按照优先级从低到高（数字从小到大）执行：

1. **logger.plugin.ts** (优先级 50) - 最先执行，记录开始日志
2. **timer.plugin.ts** (优先级 100) - 其次执行，记录执行时间
3. **error-handler.plugin.ts** (优先级 200) - 最后执行，进行性能监控

### 创建自定义插件

要创建自定义插件，需要：
1. 继承 `BasePlugin` 类
2. 设置 `static name` 属性
3. 实现 `beforeExecute` 和/或 `afterExecute` 方法
4. 可选：设置 `priority` 属性控制执行顺序

## 使用说明

1. 将这些示例文件复制到你的项目根目录或任意子目录
2. 确保文件命名符合规范（`.cmd.ts`、`.cmd.js`、`.plugin.ts` 或 `.plugin.js`）
3. 运行 `pnpm start` 或构建后运行 `jshow <command>`

## 注意事项

### 文件命名

- 命令文件必须以 `.cmd.ts` 或 `.cmd.js` 结尾
- 插件文件必须以 `.plugin.ts` 或 `.plugin.js` 结尾

### TypeScript 文件

- 必须使用 `export default` 导出类
- 命令类必须继承 `BaseCommand`
- 插件类必须继承 `BasePlugin`
- 必须设置 `static name` 属性

### CommonJS 文件

- 使用 `require()` 导入依赖：`const { BaseCommand } = require('@jshow/cli');`
- 使用 `module.exports` 导出类：
  ```javascript
  module.exports = YourCommand;
  ```
  Node.js 的 `import()` 会自动将 `module.exports` 的值作为 `default` 导出，无需手动设置 `module.exports.default`
- 命令类必须继承 `BaseCommand`
- 插件类必须继承 `BasePlugin`
- 必须设置 `static name` 属性

### 插件使用

- 在命令类中通过 `static plugins` 数组声明要使用的插件
- 插件名称必须与插件类的 `static name` 属性匹配
- 插件会按照优先级顺序执行（优先级数字越小，执行越早）

