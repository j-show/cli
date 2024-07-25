/**
 * @fileoverview 命令程序管理器
 * @description 负责命令的注册、管理和运行
 */

import { Command } from 'commander';

import { version } from '../package.json';

import { BUILT_IN_COMMANDS, BUILT_IN_PLUGINS } from './built-in';
import { isCommand, type BaseCommand, type CommandClassType } from './command';
import { isPlugin, type BasePlugin, type PluginClassType } from './plugin';

/**
 * 插件类型接口
 * @description 存储已注册插件的信息
 */
interface PluginType {
  /**
   * 插件名称
   */
  name: string;
  /**
   * 插件优先级（数字越小优先级越高）
   */
  priority: number;
  /**
   * 插件类构造函数
   */
  plugin: PluginClassType;
  /**
   * 插件实例
   */
  instance?: BasePlugin;
}

/**
 * 命令类型接口
 * @description 存储已注册命令的信息
 */
interface CommandType {
  /**
   * 命令名称
   */
  name: string;
  /**
   * 命令类构造函数
   */
  command: CommandClassType;
  /**
   * 命令实例（延迟初始化）
   * @description 在 run() 方法中才会创建实例
   */
  instance?: BaseCommand;
  /**
   * 命令分组
   */
  group?: string;
}

/**
 * 程序状态对象
 * @description 存储所有已注册的命令和 Commander 程序实例
 */
const programShape = {
  plugins: [] as PluginType[],
  /**
   * 命令映射表
   * @description 键为命令名称，值为命令类型信息
   */
  commands: new Map<string, CommandType>(),
  /**
   * Commander 程序实例
   * @description 全局唯一的程序实例
   */
  program: new Command()
};

const DEFAULT_GROUP = 'default';

/**
 * 设置并初始化命令
 * @param program - Commander 程序实例
 * @param plugins - 已安装的插件列表
 * @param item - 命令类型信息
 * @description
 * 为命令创建 Commander 子命令并实例化命令类。
 * 同时设置命令的分组信息，如果命令未指定分组则使用默认分组。
 * @internal
 */
const setupCommand = (
  program: Command,
  plugins: BasePlugin[],
  item: CommandType
): void => {
  const command = program.command(item.name);
  const instance = new item.command(command, plugins);

  // 设置命令分组信息
  item.group = instance.args.group ?? DEFAULT_GROUP;

  item.instance = instance;
};

/**
 * 按分组组织命令
 * @param commands - 命令映射表
 * @returns 按分组组织的命令映射，键为分组名称，值为该分组下的命令列表
 * @description
 * 将命令按照分组进行组织，用于在帮助信息中分类显示。
 * @internal
 */
const groupCommands = (
  commands: Map<string, CommandType>
): Map<string, CommandType[]> => {
  const grouped = new Map<string, CommandType[]>();

  commands.forEach(cmd => {
    const group = cmd.group ?? DEFAULT_GROUP;

    if (!grouped.has(group)) {
      grouped.set(group, []);
    }

    grouped.get(group)?.push(cmd);
  });

  return grouped;
};

/**
 * 增强帮助信息
 * @description 添加按分组显示的命令列表
 * @param program - Commander 程序实例
 * @internal
 */
const enhanceHelp = (program: Command): void => {
  const originalHelpInformation = program.helpInformation.bind(program);

  program.helpInformation = function () {
    let help = originalHelpInformation();

    // 按分组组织命令
    const grouped = groupCommands(programShape.commands);

    if (grouped.size > 0) {
      help += '\n\n命令分组:\n';
      const sortedGroups = Array.from(grouped.entries()).sort((a, b) => {
        // DEFAULT_GROUP 组放在最后
        if (a[0] === DEFAULT_GROUP) return 1;
        if (b[0] === DEFAULT_GROUP) return -1;
        return a[0].localeCompare(b[0]);
      });

      for (const [group, commands] of sortedGroups) {
        help += `\n  ${group}:\n`;
        for (const cmd of commands) {
          const instanceArgs = cmd.instance?.args;
          const description = instanceArgs?.description || '无描述';
          const aliases = instanceArgs?.aliases?.length
            ? ` (别名: ${instanceArgs?.aliases.join(', ')})`
            : '';

          help += `    ${cmd.name.padEnd(20)} ${description}${aliases}\n`;
        }
      }
    }

    return help;
  };
};

export const initBuiltIn = (program: typeof CommandProgram) => {
  BUILT_IN_PLUGINS.forEach(plugin => {
    if (!isPlugin(plugin)) return;
    program.install(plugin, plugin.force);
  });

  BUILT_IN_COMMANDS.forEach(command => {
    if (!isCommand(command)) return;
    program.use(command, command.force);
  });

  return program;
};

/**
 * 命令程序管理器类
 * @description 提供命令注册、管理和运行的功能
 * @example
 * ```typescript
 * // 注册命令
 * CommandProgram.use(MyCommand);
 *
 * // 运行程序
 * CommandProgram.run();
 * ```
 */
export class CommandProgram {
  /**
   * 获取 CLI 版本号
   * @returns CLI 版本字符串
   * @static
   */
  static get version(): string {
    return version;
  }

  /**
   * 获取 Commander 程序实例
   * @description 可以用于直接操作 Commander 程序，如设置全局选项、版本号等
   * @returns Commander 程序实例
   * @static
   * @example
   * ```typescript
   * CommandProgram.program
   *   .version('1.0.0')
   *   .option('-v, --verbose', 'verbose mode');
   * ```
   */
  static get program(): Command {
    return programShape.program;
  }

  /**
   * 安装一个插件
   * @param plugin - 要安装的插件类（必须继承自 BasePlugin）
   * @param force - 如果插件已存在，是否强制覆盖（默认：false）
   * @returns CommandProgram 实例（支持链式调用）
   * @throws {Error} 如果插件已存在且 force 为 false
   * @static
   * @description
   * 安装插件到程序中。插件会按照优先级排序，优先级越小的插件越先执行。
   * @example
   * ```typescript
   * // 普通安装
   * CommandProgram.install(MyPlugin);
   *
   * // 强制覆盖
   * CommandProgram.install(MyPlugin, true);
   *
   * // 链式调用
   * CommandProgram
   *   .install(Plugin1)
   *   .install(Plugin2);
   * ```
   */
  static install(plugin: PluginClassType, force?: boolean) {
    const plugins = programShape.plugins;
    const name = plugin.name;

    if (plugins.some(p => p.name === name) && !force) {
      throw new Error(`Plugin '${name}' already exists.`);
    }

    const instance = new plugin();

    plugins.push({
      name,
      plugin,
      priority: instance.priority,
      instance
    });

    plugins.sort((a, b) => a.priority - b.priority);

    return this;
  }

  /**
   * 注册一个命令类
   * @param command - 要注册的命令类（必须继承自 BaseCommand）
   * @param force - 如果命令已存在，是否强制覆盖（默认：false）
   * @returns CommandProgram 实例（支持链式调用）
   * @throws {Error} 如果命令已存在且 force 为 false
   * @static
   * @example
   * ```typescript
   * // 普通注册
   * CommandProgram.use(MyCommand);
   *
   * // 强制覆盖
   * CommandProgram.use(MyCommand, true);
   *
   * // 链式调用
   * CommandProgram
   *   .use(Command1)
   *   .use(Command2);
   * ```
   */
  static use(command: CommandClassType, force?: boolean) {
    const commands = programShape.commands;
    const name = command.name;

    // 检查命令是否已存在
    if (commands.has(name) && !force) {
      throw new Error(`Command '${name}' already exists.`);
    }

    // 获取命令分组信息（需要临时创建实例来获取 args）
    // 注意：这里不能直接实例化，因为需要 Command 实例
    // 所以分组信息会在 setupCommand 时设置

    // 注册命令（延迟实例化）
    commands.set(name, { name, command });

    return this;
  }

  /**
   * 清理所有已注册的命令和插件（主要用于测试）
   * @description 清空所有已注册的命令和插件，重置程序状态
   * @static
   * @internal
   */
  static reset(autoRun?: boolean): void {
    // 重新创建 program 实例以清除所有命令
    programShape.program = new Command();

    programShape.plugins = [];
    programShape.commands.clear();

    if (autoRun) initBuiltIn(this).run();
  }

  /**
   * 运行 CLI 程序
   * @description
   * 1. 为所有已注册但未实例化的命令创建实例
   * 2. 设置增强的帮助信息
   * 3. 解析命令行参数并执行相应的命令
   * @static
   * @example
   * ```typescript
   * // 注册命令后运行
   * CommandProgram.use(MyCommand);
   * CommandProgram.run();
   * ```
   */
  static run(): void {
    const program = programShape.program;

    // 设置版本号
    program.version(this.version, '-v, --version', '显示版本号');

    const plugins = programShape.plugins
      .map(p => p.instance)
      .filter(p => p != null);

    // 为所有命令创建实例（延迟初始化）
    programShape.commands.forEach(item => {
      // 如果已经实例化，跳过
      if (item.instance != null) return;
      setupCommand(program, plugins, item);
    });

    // 增强帮助信息
    enhanceHelp(program);

    // 解析命令行参数并执行命令，添加错误处理
    try {
      program.parse(process.argv);
    } catch (error) {
      console.error(
        '❌ 执行失败:',
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  }
}
