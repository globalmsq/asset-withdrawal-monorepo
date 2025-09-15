// Jest setup file for dlq-handler
process.env.NODE_ENV = 'test';

// Set default test environment variables
process.env.PORT = '3007';
process.env.AWS_REGION = 'ap-northeast-2';
process.env.AWS_ENDPOINT = 'http://localhost:4566';
