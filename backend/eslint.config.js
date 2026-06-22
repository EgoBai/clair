import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/', 'node_modules/', '*.js', '.dead-code/', '**/.dead-code/**'],
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'warn',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
      'no-duplicate-imports': 'error',
      // no-useless-assignment 对'声明初始化+分支赋值'防御性模式误报,且与TS明确赋值检查冲突,设warn
      'no-useless-assignment': 'warn',
    },
  },
  {
    // 测试代码放宽：chai/jest 断言表达式、桩函数空块、动态 require、测试夹具等为测试场景合理模式
    // （业界标准做法，不影响生产代码质量门槛）
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-empty': 'off',
      'no-useless-assignment': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-constant-binary-expression': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-useless-escape': 'off',
      'eqeqeq': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'no-duplicate-imports': 'off',
      'no-case-declarations': 'off',
    },
  }
);
