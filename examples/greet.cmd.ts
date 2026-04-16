/**
 * @fileoverview 带选项的命令示例
 * @description 演示如何创建带参数和选项的命令
 */

import {
  BaseCommand,
  type CommandArgs,
  type CommandContext,
  type CommandOptionsType
} from '@jshow/cli';

/**
 * `greet` 命令可用的选项类型。
 * @description
 * commander 默认会把带值选项解析为字符串；这里用 `string`，避免示例与真实行为不一致。
 */
type GreetOptions = CommandOptionsType & {
  name?: string;
  formal?: boolean;
  times?: string;
};

/**
 * 示例：`greet` 命令，演示字符串/布尔/数值类选项与自定义校验。
 */
export default class GreetCommand extends BaseCommand<GreetOptions> {
  static name = 'greet';
  static force = false;

  /**
   * 命令参数配置。
   * @returns 命令元信息与选项定义
   */
  public get args(): CommandArgs<GreetOptions> {
    return {
      name: 'greet',
      description: '向指定的人打招呼',
      aliases: ['g'],
      group: 'examples',
      options: [
        {
          name: 'name',
          abbr: 'n',
          flagValue: true,
          description: '要打招呼的人的姓名',
          defaultValue: 'World',
          required: false
        },
        {
          name: 'formal',
          abbr: 'f',
          flagValue: false,
          description: '使用正式的语气',
          defaultValue: false,
          required: false
        },
        {
          name: 'times',
          abbr: 't',
          flagValue: true,
          description: '重复打招呼的次数',
          defaultValue: '1',
          required: false
        }
      ],
      examples: [
        'jshow greet',
        'jshow greet --name "Alice"',
        'jshow greet -n "Bob" --formal',
        'jshow greet -n "Charlie" -t 3'
      ],
      validate: options => {
        const raw = options.times;
        if (raw == null || raw === '') return null;

        const n = Number.parseInt(String(raw), 10);
        if (!Number.isFinite(n) || n < 1) {
          return '重复次数必须是大于 0 的数字';
        }
        return null;
      }
    };
  }

  /**
   * 执行前钩子（示例）。
   * @param context - 命令上下文
   * @returns void
   */
  public async beforeExecute(
    context: CommandContext<GreetOptions>
  ): Promise<void> {
    console.log(`开始执行 greet 命令，参数:`, context.options);
  }

  /**
   * 命令主体逻辑（示例）。
   * @returns void
   */
  public async execute(context: CommandContext<GreetOptions>): Promise<void> {
    const { name = 'World', formal = false, times = '1' } = context.options;
    const count = Number.parseInt(String(times), 10) || 1;

    const greeting = formal ? `Good day, ${name}!` : `Hello, ${name}!`;

    for (let i = 0; i < count; i++) {
      console.log(greeting);
    }
  }

  /**
   * 执行后钩子（示例）。
   * @param context - 命令上下文
   * @returns void
   */
  public async afterExecute(
    context: CommandContext<GreetOptions>
  ): Promise<void> {
    const duration = Date.now() - context.startTime;
    console.log(`命令执行完成，耗时: ${duration}ms`);
  }
}
