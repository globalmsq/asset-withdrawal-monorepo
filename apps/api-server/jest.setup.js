// Set NODE_ENV to test for Jest tests
process.env.NODE_ENV = 'test';

// Mock database initialization
jest.mock('./src/services/database', () => ({
  initializeDatabase: jest.fn().mockResolvedValue({}),
  getDatabase: jest.fn().mockReturnValue({
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(true),
    healthCheck: jest.fn().mockResolvedValue(true),
  }),
}));