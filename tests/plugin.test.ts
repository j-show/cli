import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type CommandContext } from '../src/command';
import { BasePlugin, isPlugin } from '../src/plugin';

// 测试用的插件类
class TestPlugin extends BasePlugin {
  static name = 'test-plugin';
  static force = false;

  public get priority(): number {
    return 50;
  }

  public beforeExecute(context: CommandContext): void {
    console.log(`准备执行: ${context.name}`);
  }

  public afterExecute(context: CommandContext): void {
    const duration = Date.now() - context.startTime;
    console.log(`执行完成，耗时: ${duration}ms`);
  }
}

// 测试用的简单插件类
class SimplePlugin extends BasePlugin {
  static name = 'simple-plugin';
  static force = false;
}

describe('BasePlugin', () => {
  let plugin: TestPlugin;

  beforeEach(() => {
    plugin = new TestPlugin();
  });

  describe('静态属性', () => {
    it('应该有 name 静态属性', () => {
      expect(TestPlugin.name).toBe('test-plugin');
    });

    it('应该有 force 静态属性', () => {
      expect(TestPlugin.force).toBe(false);
    });
  });

  describe('name getter', () => {
    it('应该返回插件名称', () => {
      expect(plugin.name).toBe('test-plugin');
    });
  });

  describe('priority getter', () => {
    it('应该返回默认优先级', () => {
      const simplePlugin = new SimplePlugin();
      expect(simplePlugin.priority).toBe(100);
    });

    it('应该返回自定义优先级', () => {
      expect(plugin.priority).toBe(50);
    });
  });

  describe('生命周期钩子', () => {
    it('应该调用 beforeExecute 钩子', () => {
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      const context: CommandContext = {
        name: 'test-command',
        options: {},
        args: [],
        startTime: Date.now()
      };

      plugin.beforeExecute?.(context);

      expect(consoleLogSpy).toHaveBeenCalledWith('准备执行: test-command');

      consoleLogSpy.mockRestore();
    });

    it('应该调用 afterExecute 钩子', () => {
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      const context: CommandContext = {
        name: 'test-command',
        options: {},
        args: [],
        startTime: Date.now() - 100
      };

      plugin.afterExecute?.(context);

      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = consoleLogSpy.mock.calls[0][0];
      expect(logCall).toContain('执行完成');

      consoleLogSpy.mockRestore();
    });
  });
});

describe('isPlugin', () => {
  it('应该识别有效的插件类', () => {
    expect(isPlugin(TestPlugin)).toBe(true);
    expect(isPlugin(SimplePlugin)).toBe(true);
  });

  it('应该拒绝无效的值', () => {
    expect(isPlugin(null)).toBe(false);
    expect(isPlugin()).toBe(false);
    expect(isPlugin('string')).toBe(false);
    expect(isPlugin(123)).toBe(false);
    expect(isPlugin({})).toBe(false);
    expect(isPlugin(() => {})).toBe(false);
  });

  it('应该拒绝非 BasePlugin 子类', () => {
    class NotAPlugin {
      static name = 'test';
    }
    expect(isPlugin(NotAPlugin)).toBe(false);
  });
});
