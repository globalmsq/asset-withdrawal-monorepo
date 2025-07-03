import swaggerJSDoc from 'swagger-jsdoc';

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
          required: [
            'userId',
            'amount',
            'toAddress',
            'tokenAddress',
            'network',
          ],
          properties: {
            userId: {
              type: 'string',
              description:
                'Unique identifier of the user making the withdrawal',
              example: 'user-123456',
            },
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
              description: 'Token contract address (0x0 for native token)',
              example: '0x0000000000000000000000000000000000000000',
            },
            network: {
              type: 'string',
              description: 'Blockchain network',
              enum: ['ethereum', 'polygon', 'bsc', 'arbitrum'],
              example: 'ethereum',
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
          description:
            'JWT token for API authentication (to be implemented in Phase 4)',
        },
      },
    },
  },
  apis: ['./src/routes/*.ts', './src/app.ts'], // paths to files containing OpenAPI definitions
};

export const swaggerSpec = swaggerJSDoc(options);
