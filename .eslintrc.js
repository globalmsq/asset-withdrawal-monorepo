module.exports = {
  root: true,
  ignorePatterns: ['dist/**/*', 'node_modules/**/*', '.nx/**/*'],
  plugins: ['@nx'],
  extends: ['prettier'],
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx'],
      rules: {
        '@nx/enforce-module-boundaries': [
          'error',
          {
            enforceBuildableLibDependency: true,
            allow: [],
            depConstraints: [
              {
                sourceTag: '*',
                onlyDependOnLibsWithTags: ['*'],
              },
            ],
          },
        ],
      },
    },
    {
      files: ['*.ts', '*.tsx'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: ['./tsconfig.json'],
      },
      rules: {
        // Formatting rules are now handled by Prettier
        // ESLint-config-prettier disables all conflicting rules
      },
    },
    {
      files: ['*.js', '*.jsx'],
      parserOptions: {
        ecmaVersion: 'latest',
      },
      rules: {
        // Formatting rules are now handled by Prettier
        // ESLint-config-prettier disables all conflicting rules
      },
    },
  ],
};
