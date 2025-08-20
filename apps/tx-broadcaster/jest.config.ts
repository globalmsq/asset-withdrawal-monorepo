export default {
  displayName: 'tx-broadcaster',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/tx-broadcaster',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.spec.ts'],
  moduleNameMapper: {
    '^shared$': '<rootDir>/../../packages/shared/src',
    '^shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    '^@asset-withdrawal/shared$': '<rootDir>/../../packages/shared/src',
    '^@asset-withdrawal/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    '^@asset-withdrawal/database$': '<rootDir>/../../packages/database/src',
    '^@asset-withdrawal/database/(.*)$':
      '<rootDir>/../../packages/database/src/$1',
  },
};
