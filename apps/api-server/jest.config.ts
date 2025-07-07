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
  moduleNameMapper: {
    '^shared$': '<rootDir>/../../packages/shared/src',
    '^database$': '<rootDir>/../../packages/database/src',
  },
};
