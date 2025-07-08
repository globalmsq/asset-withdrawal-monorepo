import { Router, Request, Response } from 'express';
import {
  WithdrawalRequest,
  WithdrawalResponse,
  TransactionStatus,
  ApiResponse,
  queueManager,
} from 'shared';
import { getDatabase } from '../services/database';

const router = Router();

// Initialize queues
const txRequestQueue = queueManager.getQueue<WithdrawalRequest>('tx-request');

// Helper function to determine currency from token address
function getCurrencyFromTokenAddress(tokenAddress: string): string {
  // ETH native token (zero address)
  if (tokenAddress === '0x0000000000000000000000000000000000000000') {
    return 'ETH';
  }

  // Common token addresses (you can extend this list)
  const tokenMap: { [key: string]: string } = {
    // Ethereum mainnet
    '0xdAC17F958D2ee523a2206206994597C13D831ec7': 'USDT', // Tether
    '0x6B175474E89094C44Da98b954EedeAC495271d0F': 'DAI', // Dai Stablecoin
    '0xA0b86a33E6441C0D16C8fA7b13A4e8Da1D44ce9c': 'USDC', // USD Coin
    // Add more token addresses as needed
  };

  return tokenMap[tokenAddress] || 'TOKEN'; // Default to 'TOKEN' if not found
}

/**
 * @swagger
 * /withdrawal/request:
 *   post:
 *     tags:
 *       - withdrawal
 *     summary: Submit withdrawal request
 *     description: Creates a new withdrawal request for processing
 *     operationId: createWithdrawalRequest
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WithdrawalRequest'
 *           examples:
 *             ethereumWithdrawal:
 *               summary: Ethereum withdrawal example
 *               value:
 *                 amount: "0.5"
 *                 toAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd"
 *                 tokenAddress: "0x0000000000000000000000000000000000000000"
 *                 network: "ethereum"
 *     responses:
 *       '201':
 *         description: Withdrawal request created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: true
 *               data:
 *                 id: "tx-1234567890-abc123def"
 *                 status: "pending"
 *                 createdAt: "2025-01-03T10:00:00Z"
 *                 updatedAt: "2025-01-03T10:00:00Z"
 *               timestamp: "2025-01-03T10:00:00Z"
 *       '400':
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             examples:
 *               missingFields:
 *                 summary: Missing required fields
 *                 value:
 *                   success: false
 *                   error: "Missing required fields: amount, toAddress, tokenAddress, network"
 *                   timestamp: "2025-01-03T10:00:00Z"
 *               invalidAmount:
 *                 summary: Invalid amount
 *                 value:
 *                   success: false
 *                   error: "Invalid amount"
 *                   timestamp: "2025-01-03T10:00:00Z"
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post(
  '/request',
  async (req: Request, res: Response) => {
    try {
      const { amount, toAddress, tokenAddress, network } = req.body;
      const { TransactionService } = await import('database');
      const transactionService = new TransactionService(getDatabase());

      // Basic validation
      if (!amount || !toAddress || !tokenAddress || !network) {
        const response: ApiResponse = {
          success: false,
          error:
            'Missing required fields: amount, toAddress, tokenAddress, network',
          timestamp: new Date(),
        };
        return res.status(400).json(response);
      }

      // Validate amount
      if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid amount',
          timestamp: new Date(),
        };
        return res.status(400).json(response);
      }

      // Generate unique transaction ID
      const transactionId = `tx-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

      // Create withdrawal request
      const withdrawalRequest: WithdrawalRequest = {
        id: transactionId,
        amount,
        toAddress,
        tokenAddress,
        network,
        createdAt: new Date(),
      };

      // Save to database using Prisma
      await transactionService.createTransaction({
        amount: parseFloat(amount),
        currency: getCurrencyFromTokenAddress(tokenAddress),
        tokenAddress,
        toAddress,
        network,
        status: TransactionStatus.PENDING,
      });

      // Add to queue for processing
      await txRequestQueue.enqueue(withdrawalRequest);

      // Create response
      const withdrawalResponse: WithdrawalResponse = {
        id: transactionId,
        status: TransactionStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const response: ApiResponse<WithdrawalResponse> = {
        success: true,
        data: withdrawalResponse,
        timestamp: new Date(),
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Error processing withdrawal request:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Internal server error',
        timestamp: new Date(),
      };
      res.status(500).json(response);
    }
  }
);

/**
 * @swagger
 * /withdrawal/status/{id}:
 *   get:
 *     tags:
 *       - withdrawal
 *     summary: Get withdrawal status
 *     description: Retrieves the current status of a withdrawal request
 *     operationId: getWithdrawalStatus
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Transaction ID
 *         schema:
 *           type: string
 *           example: "tx-1234567890-abc123def"
 *     responses:
 *       '200':
 *         description: Withdrawal status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: true
 *               data:
 *                 id: "tx-1234567890-abc123def"
 *                 status: "completed"
 *                 transactionHash: "0x123abc..."
 *                 createdAt: "2025-01-03T10:00:00Z"
 *                 updatedAt: "2025-01-03T10:05:00Z"
 *               timestamp: "2025-01-03T10:05:00Z"
 *       '400':
 *         description: Invalid transaction ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       '404':
 *         description: Transaction not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get(
  '/status/:id',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { TransactionService } = await import('database');
      const transactionService = new TransactionService(getDatabase());

      if (!id) {
        const response: ApiResponse = {
          success: false,
          error: 'Transaction ID is required',
          timestamp: new Date(),
        };
        return res.status(400).json(response);
      }

      // Find transaction in database using Prisma
      const transaction = await transactionService.getTransactionById(id);

      if (!transaction) {
        const response: ApiResponse = {
          success: false,
          error: 'Transaction not found',
          timestamp: new Date(),
        };
        return res.status(404).json(response);
      }

      // Create response
      const withdrawalResponse: WithdrawalResponse = {
        id: transaction.id,
        status: transaction.status as TransactionStatus,
        transactionHash: transaction.txHash || undefined,
        error: undefined, // Error field needs to be added separately
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
      };

      const response: ApiResponse<WithdrawalResponse> = {
        success: true,
        data: withdrawalResponse,
        timestamp: new Date(),
      };

      res.json(response);
    } catch (error) {
      console.error('Error getting withdrawal status:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Internal server error',
        timestamp: new Date(),
      };
      res.status(500).json(response);
    }
  }
);

/**
 * @swagger
 * /withdrawal/queue/status:
 *   get:
 *     tags:
 *       - withdrawal
 *     summary: Get queue status
 *     description: Returns the current status of withdrawal request queues (for debugging)
 *     operationId: getQueueStatus
 *     responses:
 *       '200':
 *         description: Queue status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: true
 *               data:
 *                 tx-request:
 *                   size: 5
 *                   processing: 2
 *               timestamp: "2025-01-03T10:00:00Z"
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get('/queue/status', (_req: Request, res: Response) => {
  try {
    const queueStatus = {
      'tx-request': {
        size: txRequestQueue.getQueueSize(),
        processing: txRequestQueue.getProcessingSize(),
      },
    };

    const response: ApiResponse = {
      success: true,
      data: queueStatus,
      timestamp: new Date(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting queue status:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
      timestamp: new Date(),
    };
    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /withdrawal/queue/items:
 *   get:
 *     tags:
 *       - withdrawal
 *     summary: Get queue items
 *     description: Returns all items currently in the withdrawal request queue (for debugging)
 *     operationId: getQueueItems
 *     responses:
 *       '200':
 *         description: Queue items retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: true
 *               data:
 *                 pending:
 *                   - id: "tx-request-1234567890-abc123"
 *                     data:
 *                       id: "tx-1234567890-abc123def"
 *                       userId: "user-123456"
 *                       amount: "0.5"
 *                       toAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd"
 *                       tokenAddress: "0x0000000000000000000000000000000000000000"
 *                       network: "ethereum"
 *                       createdAt: "2025-01-03T10:00:00Z"
 *                     timestamp: "2025-01-03T10:00:00Z"
 *                     retryCount: 0
 *                 processing:
 *                   - id: "tx-request-1234567890-def456"
 *                     data:
 *                       id: "tx-1234567890-def456ghi"
 *                       userId: "user-789012"
 *                       amount: "1.0"
 *                       toAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd"
 *                       tokenAddress: "0x0000000000000000000000000000000000000000"
 *                       network: "ethereum"
 *                       createdAt: "2025-01-03T09:55:00Z"
 *                     timestamp: "2025-01-03T09:55:00Z"
 *                     retryCount: 1
 *               timestamp: "2025-01-03T10:00:00Z"
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get('/queue/items', (_req: Request, res: Response) => {
  try {
    const queueItems = {
      pending: txRequestQueue.getQueueItems(),
      processing: txRequestQueue.getProcessingItems(),
    };

    const response: ApiResponse = {
      success: true,
      data: queueItems,
      timestamp: new Date(),
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting queue items:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
      timestamp: new Date(),
    };
    res.status(500).json(response);
  }
});

export default router;
