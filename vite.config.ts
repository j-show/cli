/**
 * @fileoverview 库构建配置（Vite library mode + dts）
 * @description 产出 CJS/ESM 与类型声明；依赖与开发依赖均作 external。
 */

import path from 'node:path';

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

import pkg from './package.json';

/** 相对项目根解析绝对路径 */
const resolve = (p: string) => path.resolve(__dirname, p);

/** Rollup external：所有 package.json 中的依赖与 devDependencies */
const externals = new Set<string>([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {})
]);

export default defineConfig({
  plugins: [
    dts({
      entryRoot: resolve('src'),
      tsconfigPath: resolve('tsconfig.json'),
      outDir: resolve('dist'),
      logLevel: 'error'
    })
  ],
  build: {
    target: 'esnext',
    emptyOutDir: true,
    sourcemap: false,
    minify: false,
    lib: {
      entry: resolve('src/index.ts'),
      formats: ['cjs', 'es'],
      fileName: format => `index.${format === 'es' ? 'mjs' : format}`
    },
    rollupOptions: {
      external: Array.from(externals),
      output: {
        preserveModules: false,
        exports: 'named'
      }
    }
  }
});
