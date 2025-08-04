export default {
  displayName: 'data-access',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/libs/data-access',
  moduleNameMapper: {
    '^@asset-withdrawal/shared$': '<rootDir>/../shared/src/index.ts',
    '^@asset-withdrawal/database$': '<rootDir>/src/index.ts'
  }
};
