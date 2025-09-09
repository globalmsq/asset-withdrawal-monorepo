export default {
  displayName: 'dlq-handler',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/dlq-handler',
  setupFilesAfterEnv: [],
  setupFiles: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/node_modules/'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.spec.ts'],
  moduleNameMapping: {
    '^shared$': '<rootDir>/../../packages/shared/src',
    '^shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    '^@asset-withdrawal/shared$': '<rootDir>/../../packages/shared/src',
    '^@asset-withdrawal/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    '^@asset-withdrawal/database$': '<rootDir>/../../packages/database/src',
    '^@asset-withdrawal/database/(.*)$':
      '<rootDir>/../../packages/database/src/$1',
    '^database$': '<rootDir>/../../packages/database/src',
  },
};
