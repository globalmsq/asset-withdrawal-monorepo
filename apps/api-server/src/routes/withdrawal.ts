import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
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

// Function to rearrange UUID parts for better time-based sorting
// Original UUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (1-2-3-4-5)
// Rearranged format:   4xxx-xxxx-xxxxxxxx-yxxx-xxxxxxxxxxxx (3-2-1-4-5)
function rearrangeUuid(uuid: string): string {
  const parts = uuid.split('-');
  if (parts.length !== 5) {
    throw new Error('Invalid UUID format');
  }
  // Rearrange from [1,2,3,4,5] to [3,2,1,4,5]
  return `${parts[2]}-${parts[1]}-${parts[0]}-${parts[3]}-${parts[4]}`;
}

// Initialize queues
let txRequestQueue: IQueue<WithdrawalRequest>;

// Delay queue initialization to ensure env vars are loaded
async function initializeQueue() {
  console.log('Initializing queue with environment:');
  console.log('AWS_ENDPOINT:', process.env.AWS_ENDPOINT);
  console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID);
  console.log('AWS_REGION:', process.env.AWS_REGION);

  txRequestQueue =
    QueueFactory.createFromEnv<WithdrawalRequest>('tx-request-queue');

  // Initialize queue URL for SQS
  try {
    await txRequestQueue.getQueueUrl();
    console.log('Queue initialized successfully');
  } catch (error) {
    console.error('Failed to initialize queue:', error);
  }
}

// Initialize on first use
let queueInitialized = false;
async function ensureQueueInitialized() {
  if (!queueInitialized) {
    await initializeQueue();
    queueInitialized = true;
  }
}

// Helper function to determine symbol from token address
function getSymbolFromTokenAddress(
  tokenAddress: string,
  network: string
): string {
  // Look up token in our configuration
  const tokenInfo = tokenService.getTokenByAddress(tokenAddress, network);

  if (tokenInfo) {
    return tokenInfo.symbol;
  }

  // This should not happen as validation should catch unsupported tokens
  throw new Error(`Token ${tokenAddress} not found in configuration`);
}

/**
 * @swagger
 * /withdrawal/request:
 *   post:
 *     tags:
 *       - withdrawal
 *     summary: Submit withdrawal request
 *     description: Creates a new withdrawal request for processing. Returns a UUID v4 requestId with rearranged parts (3-2-1-4-5) for time-based sorting.
 *     operationId: createWithdrawalRequest
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - toAddress
 *               - tokenAddress
 *               - network
 *             properties:
 *               amount:
 *                 type: string
 *                 description: Amount to withdraw
 *                 example: "100"
 *               toAddress:
 *                 type: string
 *                 description: Destination wallet address
 *                 example: "0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd"
 *               tokenAddress:
 *                 type: string
 *                 description: Token contract address (only ERC-20 tokens from approved list)
 *                 example: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"
 *               symbol:
 *                 type: string
 *                 description: Token symbol (optional, but must match if provided)
 *                 example: "USDT"
 *               network:
 *                 type: string
 *                 description: Network name (currently only 'polygon' supported)
 *                 example: "polygon"
 *           examples:
 *             polygonUSDT:
 *               summary: Polygon USDT withdrawal
 *               value:
 *                 amount: "100"
 *                 toAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd"
 *                 tokenAddress: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"
 *                 symbol: "USDT"
 *                 network: "polygon"
 *             polygonMSQ:
 *               summary: Polygon MSQ withdrawal with symbol validation
 *               value:
 *                 amount: "50"
 *                 toAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd"
 *                 tokenAddress: "0x6A8Ec2d9BfBDD20A7F5A4E89D640F7E7cebA4499"
 *                 symbol: "MSQ"
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
 *                 id: "41d4-e29b-550e8400-a716-446655440000"
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
 *               symbolMismatch:
 *                 summary: Token symbol mismatch
 *                 value:
 *                   success: false
 *                   error: "Token symbol mismatch. Expected USDT but got USDC"
 *                   timestamp: "2025-01-03T10:00:00Z"
 *               unsupportedToken:
 *                 summary: Unsupported token
 *                 value:
 *                   success: false
 *                   error: "Token 0x1234567890123456789012345678901234567890 is not supported on mainnet network"
 *                   timestamp: "2025-01-03T10:00:00Z"
 *               nativeTokenNotSupported:
 *                 summary: Native token not supported
 *                 value:
 *                   success: false
 *                   error: "Native token transfers are not supported. Only ERC-20 tokens from the approved list are allowed."
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
    const { amount, toAddress, tokenAddress, symbol, network } = req.body;

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

    // Validate network (only polygon supported for backward compatibility)
    if (network !== 'polygon') {
      const response: ApiResponse = {
        success: false,
        error: 'Only polygon network is supported',
        timestamp: new Date(),
      };
      return res.status(400).json(response);
    }

    // Determine network type from the token configuration
    const networkType = process.env.POLYGON_NETWORK || 'mainnet';

    // Validate token address - Native tokens (0x0000...) are not supported
    if (tokenAddress === '0x0000000000000000000000000000000000000000') {
      const response: ApiResponse = {
        success: false,
        error:
          'Native token transfers are not supported. Only ERC-20 tokens from the approved list are allowed.',
        timestamp: new Date(),
      };
      return res.status(400).json(response);
    }

    // Validate token is in our supported list
    const tokenInfo = tokenService.getTokenByAddress(tokenAddress, networkType);

    if (!tokenInfo) {
      const response: ApiResponse = {
        success: false,
        error: `Token ${tokenAddress} is not supported on ${networkType} network`,
        timestamp: new Date(),
      };
      return res.status(400).json(response);
    }

    // If symbol is provided, validate it matches the token
    if (symbol && tokenInfo.symbol !== symbol) {
      const response: ApiResponse = {
        success: false,
        error: `Token symbol mismatch. Expected ${tokenInfo.symbol} but got ${symbol}`,
        timestamp: new Date(),
      };
      return res.status(400).json(response);
    }

    // Generate unique request ID using UUID v4 with rearranged parts for time-based sorting
    const requestId = rearrangeUuid(uuidv4());

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
          symbol: getSymbolFromTokenAddress(tokenAddress, networkType),
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
      symbol: symbol,
      network: network,
      createdAt: savedRequest.createdAt,
    };

    // Ensure queue is initialized and add to queue for processing
    await ensureQueueInitialized();
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
 *         description: Transaction ID (UUID v4 with rearranged parts)
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{12}$'
 *           example: "41d4-e29b-550e8400-a716-446655440000"
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
 *                 id: "41d4-e29b-550e8400-a716-446655440000"
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
 * /withdrawal/request-queue/status:
 *   get:
 *     tags:
 *       - withdrawal
 *     summary: Get withdrawal request queue status
 *     description: Returns the current status of the withdrawal request queue (for debugging)
 *     operationId: getRequestQueueStatus
 *     responses:
 *       '200':
 *         description: Request queue status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: true
 *               data:
 *                 size: 5
 *                 processing: 2
 *               timestamp: "2025-01-03T10:00:00Z"
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get('/request-queue/status', async (_req: Request, res: Response) => {
  try {
    // Initialize response data
    const queueStatus = {
      size: 0,
      processing: 0,
    };

    try {
      await ensureQueueInitialized();
      if (!txRequestQueue) {
        throw new Error('Request queue not initialized');
      }

      // Get queue attributes for accurate message count
      if (txRequestQueue.getQueueAttributes) {
        const attributes = await txRequestQueue.getQueueAttributes();
        queueStatus.size = attributes.approximateNumberOfMessages || 0;
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
        queueStatus.size = messages.length;
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

      queueStatus.processing = processingCount;
    } catch (e: any) {
      console.error('Error getting request queue status:', e);
      // Return zeros if there's an error
    }

    const response: ApiResponse = {
      success: true,
      data: queueStatus,
      timestamp: new Date(),
    };
    res.json(response);
  } catch (error) {
    console.error('Error in request queue status:', error);
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
 * /withdrawal/tx-queue/status:
 *   get:
 *     tags:
 *       - withdrawal
 *     summary: Get transaction queue status
 *     description: Returns the current status of the signed transaction queue (for debugging)
 *     operationId: getTxQueueStatus
 *     responses:
 *       '200':
 *         description: Transaction queue status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: true
 *               data:
 *                 size: 3
 *                 broadcasting: 1
 *               timestamp: "2025-01-03T10:00:00Z"
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get('/tx-queue/status', async (_req: Request, res: Response) => {
  try {
    // Initialize response data
    const queueStatus = {
      size: 0,
      broadcasting: 0,
    };

    try {
      // Initialize signed tx queue
      await ensureQueueInitialized();
      const signedTxQueue = QueueFactory.createFromEnv<any>('signed-tx-queue');

      // Get queue attributes for accurate message count
      if (signedTxQueue.getQueueAttributes) {
        const attributes = await signedTxQueue.getQueueAttributes();
        queueStatus.size = attributes.approximateNumberOfMessages || 0;
      } else {
        // Fallback if getQueueAttributes is not implemented
        console.warn(
          'getQueueAttributes not implemented for signed tx queue, using fallback method'
        );
        const messages = await signedTxQueue.receiveMessages({
          maxMessages: 10,
          waitTimeSeconds: 0,
          visibilityTimeout: 0,
        });
        queueStatus.size = messages.length;
      }

      // Get database stats for broadcasting count
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
      const broadcastingCount = await db.withdrawalRequest.count({
        where: {
          status: 'BROADCASTING',
        },
      });

      queueStatus.broadcasting = broadcastingCount;
    } catch (e: any) {
      console.error('Error getting tx queue status:', e);
      // Return zeros if there's an error
    }

    const response: ApiResponse = {
      success: true,
      data: queueStatus,
      timestamp: new Date(),
    };
    res.json(response);
  } catch (error) {
    console.error('Error in tx queue status:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
      timestamp: new Date(),
    };
    res.status(500).json(response);
  }
});

export default router;
