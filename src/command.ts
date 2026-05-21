/**
 * @fileoverview 命令相关类型定义和基类
 * @description 提供命令选项接口、命令参数接口和命令基类
 */

import { type Command } from 'commander';

import { logger } from './logger';

/**
 * Commander 解析后的单个选项值类型。
 * @description 布尔开关、单值字符串，或 variadic 多值数组。
 */
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
   * 是否在长选项后附加 Commander 占位参数（`<name>` / `[name]` 等，见 {@link CommandArgument}）。
   * @description
   * - `true`：生成 `--option <arg>` 形式，需配合 `required` / `variadic` 等描述占位符语义。
   * - `false`：布尔开关，仅 `--option`（可选 `defaultValue` 参与解析）。
   * @default false
   */
  flagValue?: boolean;
  /**
   * 是否为布尔开关额外注册 `--no-<name>`。
   * @description 仅当 `flagValue` 为 `false`（布尔开关）时生效；{@link initOption} 会再挂载一条 `--no-${name}`，常与 `defaultValue: true` 搭配（如 `backup -c`、`release --check`）。
   * @default false
   */
  invert?: boolean;
}

/**
 * 命令运行时解析得到的 `options` 对象类型。
 * @description 键为 {@link CommandOption.name}，值由 Commander 解析；未出现的键可能为 `undefined`。
 */
export type CommandOptionsType = Record<string, CommandValueType | undefined>;

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
 * 命令运行时挂载的插件视图（框架注入给 {@link BaseCommand}）。
 * @description 仅暴露名称与钩子；与全局 {@link BasePlugin} 并存，二者通过名称对齐。
 * @internal
 */
interface CommandPlugin {
  /**
   * 插件名称
   */
  key: string;
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
 * 将 {@link CommandArgument} 挂载为 Commander 位置参数。
 * @internal
 */
const initArgument = (program: Command, item: CommandArgument) => {
  program.argument(getArgumentFlag(item), item.description, item.defaultValue);
};

/**
 * 将 {@link CommandOption} 挂载为 Commander 选项；`invert` 时为布尔开关追加 `--no-<name>`。
 * @internal
 */
const initOption = (program: Command, item: CommandOption) => {
  const flags = [getOptionFlag(item)];
  if (item.abbr) flags.unshift(`-${item.abbr}`);
  let flag = flags.join(', ');

  program.option(flag, item.description, item.defaultValue);

  if (!item.flagValue && item.invert) {
    // 默认 true 的开关需要显式负选项，否则用户无法关闭（如 --no-push）
    flag = getOptionFlag(item);
    flag = flag.replace(`--${item.name}`, `--no-${item.name}`);

    program.option(flag);
  }
};

/**
 * 可注册的命令类构造函数签名。
 * @template T - 实例类型，默认为 {@link BaseCommand}
 */
export type CommandClassType<T extends BaseCommand = BaseCommand> = new (
  /** Commander 子命令实例 */
  command: Command,
  /** 已安装且被本命令 `args.plugins` 选中的插件视图 */
  plugins: CommandPlugin[]
) => T;

/**
 * 动态 `import()` 命令模块后的类型形状。
 */
export type CommandImportType = {
  /** 默认导出的命令类 */
  default: CommandClassType;
};

/**
 * 命令基类
 * @description 所有自定义命令都应继承此类
 * @abstract
 * @example
 * ```typescript
 * class MyCommand extends BaseCommand {
 *   static key = 'my-command';
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
  static key: string = '';

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
   * @description 如果静态属性 key 未设置，会尝试从类名获取
   * @returns 命令名称，从构造函数中获取
   */
  public get key(): string {
    const constructor = (Object.getPrototypeOf(this)?.constructor ?? {}) as {
      key?: string;
      name?: string;
    };
    return constructor.key || constructor.name || this.args.name;
  }

  /**
   * 获取命令使用的插件列表
   * @description
   * 根据命令类中定义的 plugins 静态属性，从所有已安装的插件中筛选出该命令使用的插件。
   * @returns 该命令使用的插件列表
   * @protected
   */
  protected getPlugins(): CommandPlugin[] {
    const keys = this.args.plugins ?? [];
    return this.plugins.filter(p => keys.includes(p.key));
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
    for (const item of args.arguments ?? []) {
      initArgument(program, item);
    }

    // 自动注册选项
    for (const item of args.options ?? []) {
      initOption(program, item);
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
      // Commander 将 action 回调的最后一个参数固定为 Command 实例，位置参数在其之前
      const options = this.command.opts() as T;
      const args = inputs.slice(0, -1) as string[];
      const context: CommandContext<T> = {
        name: this.key,
        options,
        args,
        startTime: Date.now()
      };

      try {
        const plugins = this.getPlugins();

        // 钩子顺序：已安装插件（按 priority 升序）→ 命令自身 → execute → 命令 after → 插件 after
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
 * 类型守卫：检查值是否为命令类（构造函数且原型链继承 {@link BaseCommand}）。
 * @description 用于动态 `import()` 后收窄模块默认导出。
 * @param value - 要检查的值（通常为 `mod.default` 或 `mod` 本身）
 * @returns 若为合法命令类则返回 true
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
