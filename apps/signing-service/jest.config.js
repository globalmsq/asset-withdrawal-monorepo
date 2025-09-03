module.exports = {
  preset: '../../jest.preset.js',
  displayName: 'signing-service',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/src/__tests__/jest.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/signing-service',
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
