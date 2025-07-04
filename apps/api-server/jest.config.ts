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
};