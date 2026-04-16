/**
 * @fileoverview 命令相关类型定义和基类
 * @description 提供命令选项接口、命令参数接口和命令基类
 */

import { type Command } from 'commander';

import { logger } from './logger';

/** Commander 解析后的选项值：布尔开关、单值或多值 */
export type CommandValueType = boolean | string | string[];

/**
 * 位置参数定义（对应 commander 的 `argument()`）。
 * @description 用于声明命令的入参结构、默认值与必填规则。
 */
export interface CommandArgument {
  /**
   * 参数名称
   * @description 参数名称
   * @example 'input'
   */
  name: string;
  /**
   * 参数描述
   * @description 参数描述
   * @example 'The input directory'
   */
  description?: string;
  /**
   * 参数默认值
   * @description 当用户未提供该参数时使用的默认值
   */
  defaultValue?: CommandValueType;
  /**
   * 参数是否必填
   * @description 参数是否必填
   * @example true
   */
  required?: boolean;
  /**
   * 参数是否可变
   * @description 如果为 true，用户可以提供多个值
   * @default false
   */
  variadic?: boolean;
}

/**
 * 命令选项配置接口
 * @description 用于定义命令的选项参数
 */
export interface CommandOption extends CommandArgument {
  /**
   * 选项缩写
   * @description 单字符缩写，如 'n'
   * @example 'n', 'v'
   */
  abbr?: string;
  /**
   * 选项是否有值
   * @description 如果为 true，选项没有值，否则选项有值
   * @default false
   */
  flagValue?: boolean;
}

/**
 * 命令运行时解析得到的 options 对象类型。
 * @description
 * 该类型用于约束 `CommandContext.options`，让命令实现方可获得类型提示。
 */
export type CommandOptionsType = Record<string, CommandValueType>;

/**
 * 命令参数配置接口
 * @description 用于定义命令的基本信息和选项
 */
export interface CommandArgs<
  T extends CommandOptionsType = CommandOptionsType
> {
  /**
   * 命令名称
   * @description 在命令行中使用的命令名称
   */
  name: string;
  /**
   * 命令别名数组
   * @description 命令的别名，用户可以使用别名来调用命令
   * @example ['ls', 'list']
   */
  aliases?: string[];
  /**
   * 使用的插件名称列表
   * @description 在子类中设置，用于指定命令使用的插件
   * @example ['plugin1', 'plugin2']
   */
  plugins?: string[];
  /**
   * 命令分组
   * @description 命令所属的分组，用于在帮助信息中分类显示
   * @example 'build', 'dev', 'test'
   */
  group?: string;
  /**
   * 命令描述
   * @description 在帮助信息中显示的命令描述
   */
  description?: string;
  /**
   * 命令使用示例
   * @description 在帮助信息中显示的使用示例
   * @example ['jshow build', 'jshow build --watch']
   */
  examples?: string[];
  /**
   * 命令参数数组
   * @description 该命令支持的所有参数
   */
  arguments?: CommandArgument[];
  /**
   * 命令选项数组
   * @description 该命令支持的所有选项
   */
  options?: CommandOption[];
  /**
   * 命令参数验证函数
   * @description 在执行前验证命令参数，返回错误信息或 null
   * @param options - 解析后的选项对象
   * @returns 验证错误信息，如果验证通过则返回 null
   */
  validate?: (options: T) => string | null;
}

/**
 * 命令执行上下文
 * @description 传递给生命周期钩子的上下文信息
 */
export interface CommandContext<
  T extends CommandOptionsType = CommandOptionsType
> {
  /**
   * 命令名称
   */
  name: string;
  /**
   * 解析后的选项
   */
  options: T;
  /**
   * 命令参数
   */
  args: string[];
  /**
   * 开始执行时间
   */
  startTime: number;
}

/**
 * 命令插件接口
 * @description 用于在命令执行前后执行钩子函数
 * @internal
 */
interface CommandPlugin {
  /**
   * 插件名称
   */
  name: string;
  /**
   * 命令执行前钩子
   */
  beforeExecute?(context: CommandContext): void;
  /**
   * 命令执行后钩子
   */
  afterExecute?(context: CommandContext): void;
}

/**
 * 根据 `CommandArgument` 生成 Commander 的参数字符串（如 `<name>`、`[files...]`）。
 * @param item - 位置参数定义
 * @returns 传给 `program.argument()` 的占位符片段
 * @internal
 */
const getArgumentFlag = (item: CommandArgument) => {
  const tmp = item.required ? '<V>' : '[V]';
  const dic = item.variadic ? '...' : '';

  return tmp.replace('V', `${item.name}${dic}`);
};

/**
 * 根据 `CommandOption` 生成长选项名；若为带值选项则拼接 `getArgumentFlag` 结果。
 * @param item - 选项定义
 * @returns 传给 `program.option()` 的 flags 片段（不含短选项 `-x`）
 * @internal
 */
const getOptionFlag = (item: CommandOption) => {
  const flags = [`--${item.name}`];
  if (item.flagValue) flags.push(getArgumentFlag(item));

  return flags.join(' ');
};

/**
 * 命令类类型定义
 * @description 表示一个可以实例化的命令类
 */
export type CommandClassType<T extends BaseCommand = BaseCommand> = new (
  command: Command,
  plugins: CommandPlugin[]
) => T;

/**
 * 命令导入类型定义
 * @description 表示一个命令模块的导入结果
 */
export type CommandImportType = { default: CommandClassType };

/**
 * 命令基类
 * @description 所有自定义命令都应继承此类
 * @abstract
 * @example
 * ```typescript
 * class MyCommand extends BaseCommand {
 *   static name = 'my-command';
 *   static force = false;
 *
 *   protected get args(): CommandArgs {
 *     return {
 *       name: 'my-command',
 *       description: '我的命令',
 *       aliases: ['m'],
 *       group: 'build',
 *       options: [
 *         {
 *           name: 'name',
 *           abbr: 'n',
 *           flagValue: true,
 *           description: '名称参数',
 *           required: true,
 *         },
 *       ],
 *       validate: (options) => {
 *         if (!options.name) return '名称参数是必填的';
 *         return null;
 *       },
 *     };
 *   }
 *
 *   protected async beforeExecute(context: CommandContext): Promise<void> {
 *     console.log('执行前准备...');
 *   }
 *
 *   public async execute(context: CommandContext): Promise<void> {
 *     const { options } = context;
 *     console.log(`Hello, ${options.name || 'world'}!`);
 *   }
 *
 *   protected async afterExecute(context: CommandContext): Promise<void> {
 *     console.log('执行完成');
 *   }
 * }
 * ```
 */
export abstract class BaseCommand<
  T extends CommandOptionsType = CommandOptionsType
> {
  /**
   * 命令名称（静态属性）
   * @description 必须在子类中设置，用于命令注册
   * @default ''
   */
  static name: string = '';

  /**
   * 是否强制覆盖同名命令（静态属性）
   * @description 如果为 true，当命令已存在时会覆盖而不是抛出错误
   * @default false
   */
  static force: boolean = false;

  /**
   * 构造函数
   * @description 创建命令实例时会自动调用 init() 方法进行初始化
   * @param command - Commander 命令实例
   * @param plugins - 命令插件列表
   */
  constructor(
    protected readonly command: Command,
    protected readonly plugins: CommandPlugin[]
  ) {
    this.init(command);
    this.setupAction();
  }

  /**
   * 获取命令参数配置
   * @description 子类必须实现此 getter，返回命令的配置信息
   * @returns 命令参数配置对象
   * @abstract
   */
  public abstract get args(): CommandArgs;

  /**
   * 获取命令名称（实例属性）
   * @description 如果静态属性 name 未设置，会尝试从类名获取
   * @returns 命令名称，从构造函数中获取
   */
  public get name(): string {
    return Object.getPrototypeOf(this)?.constructor?.name ?? this.args.name;
  }

  /**
   * 获取命令使用的插件列表
   * @description
   * 根据命令类中定义的 plugins 静态属性，从所有已安装的插件中筛选出该命令使用的插件。
   * @returns 该命令使用的插件列表
   * @protected
   */
  protected getPlugins(): CommandPlugin[] {
    const names = this.args.plugins ?? [];
    return this.plugins.filter(p => names.includes(p.name));
  }

  /**
   * 初始化命令
   * @description
   * 自动注册命令选项、别名、描述等信息。
   * 子类可以重写此方法来自定义初始化逻辑。
   * @param program - Commander 命令实例
   * @protected
   */
  protected init(program: Command): void {
    const args = this.args;

    // 设置命令描述
    if (args.description) {
      program.description(args.description);
    }

    // 设置命令别名
    if (args.aliases?.length) {
      program.aliases(args.aliases);
    }

    // 设置命令参数
    for (const { description, defaultValue, ...item } of args.arguments ?? []) {
      program.argument(getArgumentFlag(item), description, defaultValue);
    }

    // 自动注册选项
    for (const { abbr, description, defaultValue, ...item } of args.options ??
      []) {
      const flags = [getOptionFlag(item)];
      if (abbr) flags.unshift(`-${abbr}`);

      program.option(flags.join(', '), description, defaultValue);
    }

    // 添加使用示例
    if (args.examples?.length) {
      program.addHelpText(
        'after',
        '\n示例:\n' + args.examples.map(ex => `  ${ex}`).join('\n')
      );
    }
  }

  /**
   * 设置命令执行动作
   * @description 包装 execute() 方法，添加生命周期钩子和错误处理
   * @protected
   */
  protected async setupAction(): Promise<void> {
    this.command.action(async (...inputs: unknown[]) => {
      const options = this.command.opts() as T;
      const args = inputs.slice(0, -1) as string[];
      const context: CommandContext<T> = {
        name: this.name,
        options,
        args,
        startTime: Date.now()
      };

      try {
        const plugins = this.getPlugins();

        // 执行前钩子
        await Promise.all(
          plugins
            .map(plugin => plugin.beforeExecute?.(context))
            .filter(v => v != null)
        );
        await this.beforeExecute?.(context);

        // 参数验证
        const validationError = this.validateOptions(options);
        if (validationError) {
          throw new Error(validationError);
        }

        // 执行命令
        await this.execute(context);

        // 执行后钩子
        await this.afterExecute?.(context);
        await Promise.all(
          plugins
            .map(plugin => plugin.afterExecute?.(context))
            .filter(v => v != null)
        );
      } catch (error) {
        // 错误处理钩子
        const handled = this.onError(error as Error, context);
        if (!handled) {
          // 如果没有被处理，重新抛出
          throw error;
        }
      }
    });
  }

  /**
   * 验证命令选项
   * @param options - 解析后的选项对象
   * @returns 验证错误信息，如果验证通过则返回 null
   * @protected
   */
  protected validateOptions(options: T): string | null {
    const { validate, options: optionDefs = [] } = this.args;

    // 检查必填选项
    for (const option of optionDefs) {
      if (!option.required) continue;

      const flag = option.name;
      if (options[flag] != null) continue;

      return `选项 ${flag} 是必填的`;
    }

    // 执行自定义验证
    if (validate) {
      return validate(options);
    }

    return null;
  }

  /**
   * 错误处理钩子
   * @description 子类可以重写此方法来自定义错误处理逻辑
   * @param error - 发生的错误
   * @param context - 命令执行上下文
   * @returns 如果错误已被处理返回 true，否则返回 false
   * @protected
   */
  protected onError(error: Error, context: CommandContext<T>): boolean {
    // 默认实现：输出错误信息
    logger.error(`❌ 执行命令 "${context.name}" 时出错:`, error.message);
    return false;
  }

  /**
   * 执行前钩子
   * @description 子类可以重写此方法，在命令执行前执行一些准备工作
   * @param context - 命令执行上下文
   * @protected
   */
  public beforeExecute?(context: CommandContext<T>): Promise<void>;

  /**
   * 执行命令
   * @description 子类必须实现此方法，包含命令的实际执行逻辑
   * @param context - 命令执行上下文
   * @abstract
   */
  public abstract execute(context: CommandContext<T>): Promise<void>;

  /**
   * 执行后钩子
   * @description 子类可以重写此方法，在命令执行后执行一些清理工作
   * @param context - 命令执行上下文
   * @protected
   */
  public afterExecute?(context: CommandContext<T>): Promise<void>;
}

/**
 * 类型守卫：检查值是否为命令类
 * @description 用于在运行时检查一个值是否为有效的命令类
 * @param value - 要检查的值
 * @returns 如果值是 BaseCommand 的实例则返回 true，否则返回 false
 * @example
 * ```ts
 * import { isCommand } from '@jshow/cli';
 *
 * const mod = await import('./my.cmd.js');
 * const CommandCtor = (mod.default || mod) as unknown;
 *
 * if (isCommand(CommandCtor)) {
 *   // CommandCtor 现在被收窄为命令类
 * }
 * ```
 */
export const isCommand = <T extends typeof BaseCommand>(
  value?: unknown
): value is T =>
  value != null &&
  typeof value === 'function' &&
  value.prototype instanceof BaseCommand;
