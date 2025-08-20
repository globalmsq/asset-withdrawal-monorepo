export default {
  displayName: 'api-server',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/api-server',
  setupFilesAfterEnv: [],
  setupFiles: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/node_modules/'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.spec.ts'],
  moduleNameMapper: {
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
