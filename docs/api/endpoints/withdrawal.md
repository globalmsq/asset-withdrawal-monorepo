# Withdrawal API Endpoints

This document provides detailed information about the withdrawal-related API endpoints.

## Overview

The Withdrawal API allows users to request cryptocurrency withdrawals and track their status. All endpoints return JSON responses following a consistent format.

## Base URL

- Development: `http://localhost:8080`
- Production: `https://api.withdrawal.example.com`

## Authentication

Currently, the API does not require authentication (POC phase). Authentication will be added in Phase 4 using JWT tokens.

## Endpoints

### 1. Submit Withdrawal Request

Creates a new withdrawal request for processing.

**Endpoint:** `POST /withdrawal/request`

**Request Body:**

```json
{
  "userId": "user-123456",
  "amount": "0.5",
  "toAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd",
  "tokenAddress": "0x0000000000000000000000000000000000000000",
  "network": "ethereum"
}
```

**Parameters:**

- `userId` (string, required): Unique identifier of the user
- `amount` (string, required): Amount to withdraw (string to preserve precision)
- `toAddress` (string, required): Destination wallet address
- `tokenAddress` (string, required): Token contract address (use 0x0 for native token)
- `network` (string, required): Blockchain network (ethereum, polygon, bsc, arbitrum)

**Success Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "tx-1234567890-abc123def",
    "status": "pending",
    "createdAt": "2025-01-03T10:00:00Z",
    "updatedAt": "2025-01-03T10:00:00Z"
  },
  "timestamp": "2025-01-03T10:00:00Z"
}
```

**Error Responses:**

- **400 Bad Request**: Missing required fields or invalid amount
  ```json
  {
    "success": false,
    "error": "Missing required fields: userId, amount, toAddress, tokenAddress, network",
    "timestamp": "2025-01-03T10:00:00Z"
  }
  ```
- **500 Internal Server Error**: Server processing error

**Example using cURL:**

```bash
curl -X POST http://localhost:8080/withdrawal/request \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123456",
    "amount": "0.5",
    "toAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd",
    "tokenAddress": "0x0000000000000000000000000000000000000000",
    "network": "ethereum"
  }'
```

### 2. Get Withdrawal Status

Retrieves the current status of a withdrawal request.

**Endpoint:** `GET /withdrawal/status/{id}`

**Path Parameters:**

- `id` (string, required): Transaction ID returned from the request endpoint

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "tx-1234567890-abc123def",
    "status": "completed",
    "transactionHash": "0x123abc...",
    "createdAt": "2025-01-03T10:00:00Z",
    "updatedAt": "2025-01-03T10:05:00Z"
  },
  "timestamp": "2025-01-03T10:05:00Z"
}
```

**Transaction Statuses:**

- `pending`: Request received and queued
- `validating`: Validating user balance and parameters
- `signing`: Creating blockchain transaction
- `broadcasting`: Sending transaction to blockchain
- `completed`: Transaction confirmed on blockchain
- `failed`: Transaction failed (check error field)

**Error Responses:**

- **400 Bad Request**: Transaction ID is required
- **404 Not Found**: Transaction not found
- **500 Internal Server Error**: Server processing error

**Example using cURL:**

```bash
curl http://localhost:8080/withdrawal/status/tx-1234567890-abc123def
```

### 3. Get Queue Status

Returns the current status of withdrawal request queues (for debugging/monitoring).

**Endpoint:** `GET /withdrawal/queue/status`

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "tx-request": {
      "size": 5,
      "processing": 2
    }
  },
  "timestamp": "2025-01-03T10:00:00Z"
}
```

**Response Fields:**

- `size`: Number of requests waiting in queue
- `processing`: Number of requests currently being processed

**Example using cURL:**

```bash
curl http://localhost:8080/withdrawal/queue/status
```

## Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong",
  "timestamp": "2025-01-03T10:00:00Z"
}
```

Common error scenarios:

- Invalid or missing parameters
- Transaction not found
- Internal server errors
- Database connection issues

## Rate Limiting

Currently not implemented. Will be added in production deployment (Phase 7).

## Webhooks

Not yet implemented. Future versions will support webhook notifications for transaction status updates.

## Testing

You can test the API using:

- cURL (examples provided above)
- Postman collection (import from `http://localhost:8080/api-docs.json`)
- [Swagger UI](http://localhost:8080/api-docs) (interactive testing)

## Security Considerations

1. **Input Validation**: All inputs are validated for type and format
2. **SQL Injection**: Protected via Prisma ORM parameterized queries
3. **XSS Protection**: Helmet middleware enabled
4. **CORS**: Configured for specific origins in production
5. **HTTPS**: Required in production environment

## Future Enhancements

1. **Authentication**: JWT-based authentication (Phase 4)
2. **Rate Limiting**: Request throttling (Phase 7)
3. **Webhooks**: Status update notifications (Phase 6)
4. **Batch Operations**: Multiple withdrawals in one request (Phase 6)
5. **WebSocket Support**: Real-time status updates (Phase 9)
