import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { ApiResponse, AppError, ErrorCode } from 'shared';
import withdrawalRoutes from './routes/withdrawal';
import authRoutes from './routes/auth';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger';

const app = express();

// Security middleware with exceptions for Swagger UI
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ['\'self\''],
        scriptSrc: ['\'self\'', '\'unsafe-inline\'', '\'unsafe-eval\''],
        styleSrc: ['\'self\'', '\'unsafe-inline\''],
        imgSrc: ['\'self\'', 'data:', 'https:'],
      },
    },
  })
);
app.use(cors());

// Parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use(morgan('combined'));

// Routes
app.use('/auth', authRoutes);
app.use('/withdrawal', withdrawalRoutes);

/**
 * @swagger
 * /health:
 *   get:
 *     tags:
 *       - health
 *     summary: Check API health status
 *     description: Returns the health status of the API server
 *     operationId: getHealth
 *     responses:
 *       '200':
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: '2025-01-03T10:00:00Z'
 */
app.get('/health', (req, res) => {
  const response: ApiResponse<{ status: string }> = {
    success: true,
    data: {
      status: 'ok',
    },
    timestamp: new Date(),
  };
  res.json(response);
});

// Serve raw OpenAPI spec
app.get('/api-docs.json', (req, res) => {
  res.json(swaggerSpec);
});

// API Documentation
app.use(
  '/api-docs',
  swaggerUi.serve as any,
  swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Blockchain Withdrawal System API',
  }) as any
);

// Global error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error('Error:', err);

    // Handle AppError instances
    if (err instanceof AppError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        code: err.code,
        details: err.details,
        timestamp: new Date(),
      };
      return res.status(err.statusCode).json(response);
    }

    // Handle other errors
    const response: ApiResponse = {
      success: false,
      error:
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err.message || 'Internal server error',
      code: ErrorCode.UNKNOWN_ERROR,
      timestamp: new Date(),
    };
    res.status(500).json(response);
  }
);

export default app;
