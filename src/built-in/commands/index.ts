/**
 * @fileoverview 内置命令列表
 * @description 默认随 CLI 注册的命令类集合。
 */

import { type CommandClassType } from '../../command';

import { BackupCommand } from './backup.cmd';
import { PublishCommand } from './publish.cmd';
import { ReleaseCommand } from './release.cmd';
import { UpgradeCommand } from './upgrade.cmd';

/**
 * 随 `initBuiltIn` 注册到 `CommandProgram` 的内置命令类列表。
 * @description 新增内置命令时在此追加并在 README 内置命令一节同步说明。
 */
export const BUILT_IN_COMMANDS: CommandClassType[] = [
  BackupCommand,
  PublishCommand,
  ReleaseCommand,
  UpgradeCommand
];
