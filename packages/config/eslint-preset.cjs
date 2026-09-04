/**
 * Preset ESLint compartilhado. Foco em segurança (plugin:security e
 * no-unsanitized) além das regras padrão de TypeScript.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint', 'security', 'no-unsanitized'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:security/recommended-legacy',
  ],
  env: { node: true, es2022: true },
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-floating-promises': 'off',
    'security/detect-object-injection': 'off',
    'no-unsanitized/method': 'error',
    'no-unsanitized/property': 'error',
  },
  ignorePatterns: ['dist/', 'build/', 'node_modules/', '*.cjs'],
};
