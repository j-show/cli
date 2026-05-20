/**
 * @fileoverview `BasePlugin` 与 `isPlugin` 契约测试
 */

import { describe, expect, it, vi } from 'vitest';

import { type CommandContext } from '../src/command';
import { BasePlugin, isPlugin } from '../src/plugin';

class PriorityPlugin extends BasePlugin {
  static key = 'priority-plugin';

  public get priority(): number {
    return 25;
  }
}

class DefaultPlugin extends BasePlugin {
  static key = 'default-plugin';
}

class NamedOnlyPlugin extends BasePlugin {
  static name = 'named-plugin';
}

describe('BasePlugin', () => {
  it('key getter 应优先 static key', () => {
    expect(new PriorityPlugin().key).toBe('priority-plugin');
  });

  it('无 static key 时应回退构造函数 name', () => {
    expect(new NamedOnlyPlugin().key).toBe('named-plugin');
  });

  it('默认 priority 为 100，子类可覆盖', () => {
    expect(new DefaultPlugin().priority).toBe(100);
    expect(new PriorityPlugin().priority).toBe(25);
  });

  it('生命周期钩子应按实现调用', async () => {
    const beforeSpy = vi.fn();
    const afterSpy = vi.fn();

    class HookPlugin extends BasePlugin {
      static key = 'hook';

      public async beforeExecute(ctx: CommandContext): Promise<void> {
        beforeSpy(ctx.name);
      }

      public async afterExecute(ctx: CommandContext): Promise<void> {
        afterSpy(ctx.name);
      }
    }

    const ctx: CommandContext = {
      name: 'demo',
      options: {},
      args: [],
      startTime: Date.now()
    };

    const plugin = new HookPlugin();
    await plugin.beforeExecute?.(ctx);
    await plugin.afterExecute?.(ctx);

    expect(beforeSpy).toHaveBeenCalledWith('demo');
    expect(afterSpy).toHaveBeenCalledWith('demo');
  });
});

describe('isPlugin', () => {
  it('应识别 BasePlugin 子类', () => {
    expect(isPlugin(PriorityPlugin)).toBe(true);
  });

  it('应拒绝非插件类与无效值', () => {
    expect(isPlugin(null)).toBe(false);
    expect(isPlugin(void 0)).toBe(false);
    expect(isPlugin(() => {})).toBe(false);
    expect(isPlugin(class NotPlugin {})).toBe(false);
  });
});
