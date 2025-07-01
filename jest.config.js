module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  clearMocks: true,
  // Nx가 각 패키지에서 jest를 실행하므로, 각 패키지의 src를 테스트 대상으로 함
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  // 커버리지 리포트를 루트에 생성하도록 설정
  coverageDirectory: '<rootDir>/../../coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  coverageReporters: ['json-summary', 'text', 'lcov'],
};
