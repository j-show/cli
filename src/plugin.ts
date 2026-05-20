/**
 * @fileoverview 插件系统
 * @description 提供 `BasePlugin` 基类与 `isPlugin` 守卫；插件按 `priority` 排序后在命令 `action` 前后触发钩子。
 */

import { type CommandContext } from './command';

/**
 * 可注册的插件类构造函数签名。
 * @template T - 实例类型，默认为 {@link BasePlugin}
 */
export type PluginClassType<T extends BasePlugin = BasePlugin> = new () => T;

/**
 * 动态 `import()` 插件模块后的类型形状。
 */
export type PluginImportType = {
  /** 默认导出的插件类 */
  default: PluginClassType;
};

/**
 * 插件基类
 * @description 所有自定义插件都应继承此类
 * @abstract
 * @example
 * ```typescript
 * class MyPlugin extends BasePlugin {
 *   static key = 'my-plugin';
 *   static force = false;
 *
 *   public get priority(): number {
 *     return 50; // 数字越小越先执行（与 CommandProgram.install 中的排序一致）
 *   }
 *
 *   public async beforeExecute(context: CommandContext): Promise<void> {
 *     console.log(`准备执行命令: ${context.name}`);
 *   }
 *
 *   public async afterExecute(context: CommandContext): Promise<void> {
 *     const duration = Date.now() - context.startTime;
 *     console.log(`命令执行完成，耗时: ${duration}ms`);
 *   }
 * }
 * ```
 */
export class BasePlugin {
  /**
   * 插件名称（静态属性）
   * @description 必须在子类中设置，用于插件注册
   * @default ''
   */
  static key: string = '';

  /**
   * 是否强制覆盖同名插件（静态属性）
   * @description 如果为 true，当插件已存在时会覆盖而不是抛出错误
   * @default false
   */
  static force: boolean = false;

  /**
   * 获取插件名称（实例属性）
   * @description 如果静态属性 key 未设置，会尝试从类名获取
   * @returns 插件名称
   */
  public get key(): string {
    const constructor = (Object.getPrototypeOf(this)?.constructor ?? {}) as {
      key?: string;
      name?: string;
    };
    return constructor.key || constructor.name || '';
  }

  /**
   * 获取插件优先级
   * @description 优先级数字越小，插件越先执行。默认优先级为 100。
   * 子类可以重写此 getter 来自定义优先级。
   * @returns 插件优先级，默认为 100
   */
  public get priority(): number {
    return 100;
  }

  /**
   * 命令执行前钩子
   * @description 子类可以重写此方法，在命令执行前执行一些操作
   * @param context - 命令执行上下文
   * @example
   * ```typescript
   * public async beforeExecute(context: CommandContext): Promise<void> {
   *   console.log(`开始执行: ${context.name}`);
   * }
   * ```
   */
  public beforeExecute?(context: CommandContext): Promise<void>;

  /**
   * 命令执行后钩子
   * @description 子类可以重写此方法，在命令执行后执行一些操作
   * @param context - 命令执行上下文
   * @example
   * ```typescript
   * public async afterExecute(context: CommandContext): Promise<void> {
   *   const duration = Date.now() - context.startTime;
   *   console.log(`执行完成，耗时: ${duration}ms`);
   * }
   * ```
   */
  public afterExecute?(context: CommandContext): Promise<void>;
}

/**
 * 类型守卫：检查值是否为插件类（构造函数且原型链继承 {@link BasePlugin}）。
 * @description 用于动态 `import()` 后收窄模块默认导出。
 * @param value - 要检查的值（通常为 `mod.default` 或 `mod` 本身）
 * @returns 若为合法插件类则返回 true
 * @template T - 插件类型
 * @example
 * ```typescript
 * if (isPlugin(MyPlugin)) {
 *   CommandProgram.install(MyPlugin);
 * }
 * ```
 */
export const isPlugin = <T extends typeof BasePlugin>(
  value?: unknown
): value is T =>
  value != null &&
  typeof value === 'function' &&
  value.prototype instanceof BasePlugin;
