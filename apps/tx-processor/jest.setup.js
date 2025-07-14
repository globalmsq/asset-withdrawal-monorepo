// Set NODE_ENV to test for Jest tests
process.env.NODE_ENV = 'test';

// Set default test environment variables
process.env.PORT = '3001';
process.env.AWS_REGION = 'ap-northeast-2';
process.env.AWS_ENDPOINT = 'http://localhost:4566';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';