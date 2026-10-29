// Server-side lint, run with `npm run lint`. The client is linted by
// react-scripts' own ESLint 8 setup, which switches to flat config if it finds
// an eslint.config.js in a parent directory, hence the non-default name.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'client/**',
      'public/**',
      'data/**',
      'node_modules/**',
      '.dev/**',
      // Unused (not required anywhere)
      'controllers/apps/getIntegrationsApps.js',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      // Style-only findings in existing code; correctness rules stay errors
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-useless-escape': 'warn',
    },
  },
];
