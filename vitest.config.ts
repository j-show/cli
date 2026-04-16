/**
 * @fileoverview Vitest 配置
 * @description Node 环境、测试目录与覆盖率输出策略。
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'tests/', 'examples/']
    }
  }
});
