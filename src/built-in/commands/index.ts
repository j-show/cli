/**
 * @fileoverview 内置命令列表
 * @description 默认随 CLI 注册的命令类集合。
 */

import { type CommandClassType } from '../../command';

import { BackupCommand } from './backup.cmd';
import { ReleaseCommand } from './release.cmd';

/** 启动时由 `initBuiltIn` 注册的命令类 */
export const BUILT_IN_COMMANDS: CommandClassType[] = [
  BackupCommand,
  ReleaseCommand
];
