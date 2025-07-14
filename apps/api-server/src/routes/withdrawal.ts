import { Router, Request, Response } from 'express';
import {
  WithdrawalRequest,
  WithdrawalResponse,
  TransactionStatus,
  ApiResponse,
  QueueFactory,
  IQueue,
  tokenService,
} from 'shared';
import { getDatabase } from '../services/database';
import { config } from '../config';

const router = Router();

// Initialize queues
let txRequestQueue: IQueue<WithdrawalRequest>;

// Initialize queue on startup
(async () => {
  txRequestQueue =
    QueueFactory.createFromEnv<WithdrawalRequest>('tx-request-queue');

  // Initialize queue URL for SQS
  try {
    await txRequestQueue.getQueueUrl();
    console.log('Queue initialized successfully');
  } catch (error) {
    console.error('Failed to initialize queue:', error);
  }
})();

// Helper function to determine currency from token address
function getCurrencyFromTokenAddress(tokenAddress: string, network: string): string {
  // Native token (zero address)
  if (tokenAddress === '0x0000000000000000000000000000000000000000') {
    return network === 'polygon' ? 'MATIC' : 'ETH';
  }

  // Look up token in our configuration
  const tokenInfo = tokenService.getTokenByAddress(tokenAddress, network === 'polygon' ? 'mainnet' : network);
  
  if (tokenInfo) {
    return tokenInfo.symbol;
  }

  return 'TOKEN'; // Default to 'TOKEN' if not found
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
 *                 network: "polygon"
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
router.post('/request', async (req: Request, res: Response) => {
  try {
    const { amount, toAddress, tokenAddress, network } = req.body;

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

    // Validate network (only polygon supported)
    if (network !== 'polygon') {
      const response: ApiResponse = {
        success: false,
        error: 'Only polygon network is supported',
        timestamp: new Date(),
      };
      return res.status(400).json(response);
    }

    // Validate token address
    const networkName = process.env.POLYGON_NETWORK || 'mainnet';
    if (tokenAddress !== '0x0000000000000000000000000000000000000000' && 
        !tokenService.isTokenSupported(tokenAddress, networkName)) {
      const response: ApiResponse = {
        success: false,
        error: `Token ${tokenAddress} is not supported on ${networkName} network`,
        timestamp: new Date(),
      };
      return res.status(400).json(response);
    }

    // Generate unique request ID
    const requestId = `tx-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    // Get database and save withdrawal request
    const dbService = getDatabase();
    let db;
    if ('getClient' in dbService && typeof dbService.getClient === 'function') {
      db = dbService.getClient();
    } else {
      db = dbService;
    }

    // Create withdrawal request in database
    console.log('Creating withdrawal request with ID:', requestId);
    console.log(
      'Database client type:',
      typeof db,
      'has withdrawalRequest:',
      'withdrawalRequest' in db
    );

    let savedRequest;
    try {
      savedRequest = await db.withdrawalRequest.create({
        data: {
          requestId: requestId,
          amount: amount,
          currency: getCurrencyFromTokenAddress(tokenAddress, network),
          toAddress: toAddress,
          tokenAddress: tokenAddress,
          network: network,
          status: 'PENDING',
        },
      });
      console.log(
        'Withdrawal request saved with ID:',
        savedRequest.id,
        'requestId:',
        savedRequest.requestId
      );
    } catch (dbError: any) {
      console.error('Database error:', dbError);
      throw dbError;
    }

    // Prepare message for SQS
    const withdrawalRequest: WithdrawalRequest = {
      id: requestId,
      amount: amount,
      toAddress: toAddress,
      tokenAddress: tokenAddress,
      network: network,
      createdAt: savedRequest.createdAt,
    };

    // Add to queue for processing
    await txRequestQueue.sendMessage(withdrawalRequest);

    // Create response
    const withdrawalResponse: WithdrawalResponse = {
      id: requestId,
      status: TransactionStatus.PENDING,
      createdAt: savedRequest.createdAt,
      updatedAt: savedRequest.updatedAt,
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
});

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
router.get('/status/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      const response: ApiResponse = {
        success: false,
        error: 'Transaction ID is required',
        timestamp: new Date(),
      };
      return res.status(400).json(response);
    }

    // Get database instance and find withdrawal request
    const dbService = getDatabase();
    console.log(
      'dbService type:',
      typeof dbService,
      'has getClient:',
      'getClient' in dbService
    );

    let db;
    if ('getClient' in dbService && typeof dbService.getClient === 'function') {
      db = dbService.getClient();
    } else {
      // dbService might already be the Prisma client
      db = dbService;
    }

    console.log('Searching for withdrawal request with requestId:', id);

    const withdrawalRequest = await db.withdrawalRequest.findUnique({
      where: { requestId: id },
    });

    if (!withdrawalRequest) {
      const response: ApiResponse = {
        success: false,
        error: 'Withdrawal request not found',
        timestamp: new Date(),
      };
      return res.status(404).json(response);
    }

    // Check if there's a related transaction
    let transaction = null;
    if (
      withdrawalRequest.status === 'COMPLETED' ||
      withdrawalRequest.status === 'BROADCASTING'
    ) {
      transaction = await db.transaction.findFirst({
        where: { requestId: id },
      });
    }

    // Create response
    const withdrawalResponse: WithdrawalResponse = {
      id: withdrawalRequest.requestId,
      status: withdrawalRequest.status as TransactionStatus,
      transactionHash: transaction?.txHash || undefined,
      error: withdrawalRequest.errorMessage || undefined,
      createdAt: withdrawalRequest.createdAt,
      updatedAt: withdrawalRequest.updatedAt,
    };

    const response: ApiResponse<WithdrawalResponse> = {
      success: true,
      data: withdrawalResponse,
      timestamp: new Date(),
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error getting withdrawal status:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      id: req.params.id,
    });
    const response: ApiResponse = {
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date(),
    };
    res.status(500).json(response);
  }
});

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
router.get('/queue/status', async (_req: Request, res: Response) => {
  try {
    // Initialize response data
    const queueStatus = {
      'tx-request': {
        size: 0,
        processing: 0,
      },
    };

    try {
      if (!txRequestQueue) {
        throw new Error('Queue not initialized');
      }

      // Get queue attributes for accurate message count
      if (txRequestQueue.getQueueAttributes) {
        const attributes = await txRequestQueue.getQueueAttributes();
        queueStatus['tx-request'].size =
          attributes.approximateNumberOfMessages || 0;
        // Note: approximateNumberOfMessagesNotVisible includes messages being processed
      } else {
        // Fallback if getQueueAttributes is not implemented
        console.warn(
          'getQueueAttributes not implemented, using fallback method'
        );
        const messages = await txRequestQueue.receiveMessages({
          maxMessages: 10,
          waitTimeSeconds: 0,
          visibilityTimeout: 0,
        });
        queueStatus['tx-request'].size = messages.length;
      }

      // Get database stats for processing count
      const dbService = getDatabase();
      let db;
      if (
        'getClient' in dbService &&
        typeof dbService.getClient === 'function'
      ) {
        db = dbService.getClient();
      } else {
        db = dbService;
      }
      const processingCount = await db.withdrawalRequest.count({
        where: {
          status: {
            in: ['VALIDATING', 'SIGNING', 'BROADCASTING'],
          },
        },
      });

      queueStatus['tx-request'].processing = processingCount;
    } catch (e: any) {
      console.error('Error getting queue status:', e);
      // Return zeros if there's an error
    }

    const response: ApiResponse = {
      success: true,
      data: queueStatus,
      timestamp: new Date(),
    };
    res.json(response);
  } catch (error) {
    console.error('Error in queue status:', error);
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
 *                       amount: "0.5"
 *                       toAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd"
 *                       tokenAddress: "0x0000000000000000000000000000000000000000"
 *                       network: "polygon"
 *                       createdAt: "2025-01-03T10:00:00Z"
 *                     timestamp: "2025-01-03T10:00:00Z"
 *                     retryCount: 0
 *                 processing:
 *                   - id: "tx-request-1234567890-def456"
 *                     data:
 *                       id: "tx-1234567890-def456ghi"
 *                       amount: "1.0"
 *                       toAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd"
 *                       tokenAddress: "0x0000000000000000000000000000000000000000"
 *                       network: "polygon"
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
router.get('/queue/items', async (_req: Request, res: Response) => {
  try {
    let messages: any[] = [];
    let error = null;
    let queueUrl = 'Not initialized';

    try {
      if (!txRequestQueue) {
        throw new Error('Queue not initialized');
      }

      // Get queue URL first
      queueUrl = await txRequestQueue.getQueueUrl();

      // Receive messages without deleting them
      // Setting visibilityTimeout to 0 makes messages immediately visible again
      const receivedMessages = await txRequestQueue.receiveMessages({
        maxMessages: 10,
        waitTimeSeconds: 0, // Don't wait for messages
        visibilityTimeout: 0, // Make messages immediately visible again
      });

      messages = receivedMessages.map(msg => ({
        id: msg.id,
        body: msg.body,
        attributes: msg.attributes || {},
        receiptHandle: msg.receiptHandle.substring(0, 20) + '...', // Truncate for security
      }));
    } catch (e: any) {
      error = e.message || 'Failed to retrieve queue messages';
      console.error('Error retrieving queue messages:', e);
    }

    const response: ApiResponse = {
      success: true,
      data: {
        queueUrl: queueUrl,
        messageCount: messages.length,
        messages: messages,
        error: error,
        note: error
          ? 'Failed to retrieve messages'
          : 'Messages retrieved (not deleted from queue)',
      },
      timestamp: new Date(),
    };
    res.json(response);
  } catch (error) {
    console.error('Error in queue items:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
      timestamp: new Date(),
    };
    res.status(500).json(response);
  }
});

export default router;
