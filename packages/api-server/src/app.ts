import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { ApiResponse } from 'shared';
import withdrawalRoutes from './routes/withdrawal';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use(morgan('combined'));

// Routes
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
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Serve raw OpenAPI spec
app.get('/api-docs.json', (req, res) => {
  res.json(swaggerSpec);
});

// API Documentation - setup swagger without complex middleware chaining
app.get('/api-docs', (req, res) => {
  const html = swaggerUi.generateHTML(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Blockchain Withdrawal System API',
  });
  res.send(html);
});

// Global error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error('Error:', err.message);
    const response: ApiResponse = {
      success: false,
      error: err.message || 'Internal server error',
      timestamp: new Date(),
    };
    res.status(500).json(response);
  }
);

export default app;
