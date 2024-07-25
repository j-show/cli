import jshowConfig from 'eslint-config-jshow/node';
import prettierConfig from 'eslint-config-prettier';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

export default [
  ...jshowConfig,
  prettierConfig,
  prettierRecommended,
  {
    ignores: ['dist', 'node_modules', 'coverage']
  },
  {
    rules: {
      'prettier/prettier': 'error'
    }
  },
  {
    // 为 examples 目录中的 CommonJS 文件添加特殊配置
    files: ['examples/**/*.{js,ts}', 'tests/**/*.{js,ts}', 'scripts/*.{js,ts}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      'no-console': 'off',
      'no-restricted-globals': 'off'
    }
  }
];
