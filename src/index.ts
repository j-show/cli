/* eslint-disable jshow/sort-export */

/**
 * 导出 commander 库的所有内容
 * @description 方便开发者直接使用 commander 的功能，无需额外安装
 */
export * from 'commander';

/**
 * 导出命令程序管理器
 */
export { CommandProgram } from './program';

/**
 * 导出命令相关类型和基类
 * @description 包括 CommandOption、CommandArgs、BaseCommand 和 isCommand
 */
export * from './command';

/**
 * 导出插件系统
 * @description 包括 Plugin、PluginManager 和 pluginManager
 */
export * from './plugin';
