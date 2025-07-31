import swaggerJSDoc from 'swagger-jsdoc';

// 환경에 따라 다른 파일 경로 설정
const getApiPaths = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (isProduction) {
    // 프로덕션 환경에서도 TypeScript 파일들을 참조 (Docker에서 ts-node 사용)
    return [
      '/app/apps/api-server/src/routes/*.ts',
      '/app/apps/api-server/src/app.ts',
    ];
  } else if (isDevelopment) {
    // 개발 환경에서는 TypeScript 파일들을 참조
    return ['./src/routes/*.ts', './src/app.ts'];
  } else {
    // 테스트 환경 등에서는 현재 디렉토리 기준
    return ['./src/routes/*.ts', './src/app.ts'];
  }
};

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Blockchain Withdrawal System API',
      description:
        'API for managing cryptocurrency withdrawal requests and transactions',
      version: '1.0.0',
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:8080',
        description: 'Development server',
      },
      {
        url: 'https://api.withdrawal.example.com',
        description: 'Production server',
      },
    ],
    tags: [
      {
        name: 'auth',
        description: 'Authentication and authorization',
      },
      {
        name: 'withdrawal',
        description: 'Withdrawal request operations',
      },
      {
        name: 'health',
        description: 'System health checks',
      },
    ],
    components: {
      schemas: {
        WithdrawalRequest: {
          type: 'object',
          required: ['amount', 'toAddress', 'tokenAddress', 'network'],
          properties: {
            amount: {
              type: 'string',
              description:
                'Amount to withdraw (as string to preserve precision)',
              example: '0.5',
            },
            toAddress: {
              type: 'string',
              description: 'Destination wallet address',
              example: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
            },
            tokenAddress: {
              type: 'string',
              description: 'Token contract address. For localhost testnet: mUSDT: 0x5FbDB2315678afecb367f032d93F642f64180aa3, mMSQ: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512, mSUT: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0, mKWT: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9, mP2UC: 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
              example: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
            },
            network: {
              type: 'string',
              description: 'Blockchain network',
              enum: ['ethereum', 'polygon', 'bsc', 'arbitrum', 'localhost'],
              example: 'localhost',
            },
          },
        },
        WithdrawalResponse: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique transaction identifier',
              example: 'tx-1234567890-abc123def',
            },
            status: {
              type: 'string',
              description: 'Current transaction status',
              enum: [
                'pending',
                'validating',
                'signing',
                'broadcasting',
                'completed',
                'failed',
              ],
              example: 'pending',
            },
            transactionHash: {
              type: 'string',
              description: 'Blockchain transaction hash (when available)',
              example: '0x123abc...',
            },
            error: {
              type: 'string',
              description: 'Error message (if failed)',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Transaction creation timestamp',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp',
            },
          },
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Indicates if the request was successful',
            },
            data: {
              type: 'object',
              description: 'Response data (varies by endpoint)',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Response timestamp',
            },
          },
        },
        ApiErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Always false for error responses',
              example: false,
            },
            error: {
              type: 'string',
              description: 'Error message',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Error timestamp',
            },
          },
        },
      },
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for API authentication',
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
              example: 'user@example.com',
            },
            password: {
              type: 'string',
              format: 'password',
              description: 'User password',
              example: 'securePassword123',
            },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            token: {
              type: 'string',
              description: 'JWT authentication token',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            user: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'User ID',
                  example: 'user-123456',
                },
                email: {
                  type: 'string',
                  format: 'email',
                  description: 'User email',
                  example: 'user@example.com',
                },
                role: {
                  type: 'string',
                  enum: ['USER', 'ADMIN'],
                  description: 'User role',
                  example: 'USER',
                },
              },
            },
            expiresIn: {
              type: 'number',
              description: 'Token expiration time in seconds',
              example: 86400,
            },
          },
        },
        RegisterRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
              example: 'newuser@example.com',
            },
            password: {
              type: 'string',
              format: 'password',
              description: 'User password (min 8 chars)',
              minLength: 8,
              example: 'securePassword123',
            },
            wallet: {
              type: 'string',
              description: 'Optional Ethereum wallet address',
              example: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
            },
          },
        },
      },
    },
  },
  apis: getApiPaths(), // 환경에 따른 동적 경로 설정
};

export const swaggerSpec = swaggerJSDoc(options);
