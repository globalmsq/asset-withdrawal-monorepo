module.exports = {
  root: true,
  ignorePatterns: ['dist/**/*', 'node_modules/**/*', '.nx/**/*'],
  plugins: ['@nx'],
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
        // Whitespace and formatting rules
        'no-trailing-spaces': 'error',
        'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0, maxBOF: 0 }],
        'eol-last': ['error', 'always'],
        'indent': ['error', 2, { SwitchCase: 1 }],
        'semi': ['error', 'always'],
        'quotes': ['error', 'single'],
        'comma-spacing': ['error', { before: false, after: true }],
        'key-spacing': ['error', { beforeColon: false, afterColon: true }],
        'object-curly-spacing': ['error', 'always'],
        'array-bracket-spacing': ['error', 'never'],
        'space-before-blocks': 'error',
        'space-infix-ops': 'error',
        'space-unary-ops': ['error', { words: true, nonwords: false }],
        'keyword-spacing': 'error',
        'comma-dangle': ['error', 'always-multiline'],
      },
    },
    {
      files: ['*.js', '*.jsx'],
      parserOptions: {
        ecmaVersion: 'latest',
      },
      rules: {
        // Whitespace and formatting rules
        'no-trailing-spaces': 'error',
        'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0, maxBOF: 0 }],
        'eol-last': ['error', 'always'],
        'indent': ['error', 2, { SwitchCase: 1 }],
        'semi': ['error', 'always'],
        'quotes': ['error', 'single'],
        'comma-spacing': ['error', { before: false, after: true }],
        'key-spacing': ['error', { beforeColon: false, afterColon: true }],
        'object-curly-spacing': ['error', 'always'],
        'array-bracket-spacing': ['error', 'never'],
        'space-before-blocks': 'error',
        'space-infix-ops': 'error',
        'space-unary-ops': ['error', { words: true, nonwords: false }],
        'keyword-spacing': 'error',
        'comma-dangle': ['error', 'always-multiline'],
      },
    },
  ],
};
