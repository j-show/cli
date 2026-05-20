import jshowConfig from 'eslint-config-jshow';

const prettierConfigs = await jshowConfig.prettier(process.cwd());

export default [
  ...jshowConfig.node,
  ...prettierConfigs,
  {
    ignores: ['dist', 'node_modules']
  },
  {
    // 为 examples 目录中的 CommonJS 文件添加特殊配置
    files: ['test/**/*.{js,ts}', 'scripts/*.{js,ts}', 'examples/**/*.{js,ts}'],
    rules: {
      'no-console': 'off'
    }
  }
];
