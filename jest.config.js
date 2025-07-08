module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  clearMocks: true,
  // Since Nx runs jest in each package, target src of each package for testing
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  // Configure to generate coverage report in the root
  coverageDirectory: '<rootDir>/../../coverage',
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageReporters: ['json-summary', 'text', 'lcov'],
};
