/**
 * @fileoverview 插件系统
 * @description 提供插件接口和插件管理器，支持命令执行前后的钩子函数
 */

import { type CommandContext } from './command';

/**
 * 插件类类型定义
 * @description 表示一个可以实例化的插件类
 * @template T - 插件类型，默认为 BasePlugin
 */
export type PluginClassType<T extends BasePlugin = BasePlugin> = new () => T;

/**
 * 插件导入类型定义
 * @description 表示一个插件模块的导入结果
 */
export type PluginImportType = { default: PluginClassType };

/**
 * 插件基类
 * @description 所有自定义插件都应继承此类
 * @abstract
 * @example
 * ```typescript
 * class MyPlugin extends BasePlugin {
 *   static name = 'my-plugin';
 *   static force = false;
 *
 *   public get priority(): number {
 *     return 50; // 优先级越高（数字越小）越先执行
 *   }
 *
 *   public beforeExecute(context: CommandContext): void {
 *     console.log(`准备执行命令: ${context.name}`);
 *   }
 *
 *   public afterExecute(context: CommandContext): void {
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
  static name: string = '';

  /**
   * 是否强制覆盖同名插件（静态属性）
   * @description 如果为 true，当插件已存在时会覆盖而不是抛出错误
   * @default false
   */
  static force: boolean = false;

  /**
   * 获取插件名称（实例属性）
   * @description 如果静态属性 name 未设置，会尝试从类名获取
   * @returns 插件名称
   */
  public get name(): string {
    return Object.getPrototypeOf(this)?.constructor?.name ?? '';
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
   * public beforeExecute(context: CommandContext): void {
   *   console.log(`开始执行: ${context.name}`);
   * }
   * ```
   */
  public beforeExecute?(context: CommandContext): void;

  /**
   * 命令执行后钩子
   * @description 子类可以重写此方法，在命令执行后执行一些操作
   * @param context - 命令执行上下文
   * @example
   * ```typescript
   * public afterExecute(context: CommandContext): void {
   *   const duration = Date.now() - context.startTime;
   *   console.log(`执行完成，耗时: ${duration}ms`);
   * }
   * ```
   */
  public afterExecute?(context: CommandContext): void;
}

/**
 * 类型守卫：检查值是否为插件类
 * @description 用于在运行时检查一个值是否为有效的插件类
 * @param value - 要检查的值
 * @returns 如果值是 BasePlugin 的实例则返回 true，否则返回 false
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
