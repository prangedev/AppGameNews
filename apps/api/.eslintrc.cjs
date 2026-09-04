module.exports = {
  ...require('@appgamenews/config/eslint-preset.cjs'),
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: false,
  },
};
