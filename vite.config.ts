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

export default defineConfig({
  plugins: [
    dts({
      entryRoot: resolve('src'),
      tsconfigPath: resolve('tsconfig.json'),
      outDir: resolve('dist'),
      logLevel: 'error'
    })
  ],
  ssr: {
    target: 'node'
  },
  build: {
    ssr: true,
    target: 'esnext',
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    // lib: {
    // entry: [resolve('src/index.ts'), resolve('src/cli.ts')]
    // formats: ['cjs', 'es'],
    // fileName: (format, name) => `${name}.${format === 'es' ? 'mjs' : 'cjs'}`
    // },
    rollupOptions: {
      external: Object.keys(pkg.dependencies ?? {}),
      input: {
        cli: resolve('src/cli.ts'),
        index: resolve('src/index.ts')
      },
      output: [
        {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          preserveModules: true,
          preserveModulesRoot: 'src'
        },
        {
          format: 'es',
          entryFileNames: '[name].mjs',
          preserveModules: true,
          preserveModulesRoot: 'src'
        }
      ]
    }
  }
});
