# Withdrawal API Endpoints

This document provides detailed information about the withdrawal-related API endpoints.

## Overview

The Withdrawal API allows users to request cryptocurrency withdrawals and track their status. All endpoints return JSON responses following a consistent format.

## Base URL

- Development: `http://localhost:3000/api`
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
  "amount": "0.5",
  "toAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd",
  "tokenAddress": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  "chain": "polygon",
  "network": "mainnet"
}
```

**Parameters:**

- `amount` (string, required): Amount to withdraw (string to preserve precision)
- `toAddress` (string, required): Destination wallet address
- `tokenAddress` (string, required): Token contract address (ERC-20 tokens only, native tokens not supported)
- `chain` (string, required): Blockchain name (polygon, localhost, ethereum, bsc)
- `network` (string, required): Network type (mainnet, testnet, amoy)

**Success Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "41d4-e29b-550e8400-a716-446655440000",
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
    "error": "Missing required fields: amount, toAddress, tokenAddress, network",
    "timestamp": "2025-01-03T10:00:00Z"
  }
  ```
- **500 Internal Server Error**: Server processing error

**Example using cURL:**

```bash
curl -X POST http://localhost:3000/api/withdrawal/request \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "0.5",
    "toAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd",
    "tokenAddress": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    "chain": "polygon",
    "network": "mainnet"
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
    "id": "41d4-e29b-550e8400-a716-446655440000",
    "status": "CONFIRMED",
    "transactionHash": "0x123abc...",
    "createdAt": "2025-01-03T10:00:00Z",
    "updatedAt": "2025-01-03T10:05:00Z"
  },
  "timestamp": "2025-01-03T10:05:00Z"
}
```

**Transaction Statuses:**

- `PENDING`: Request received and queued
- `VALIDATING`: Validating user balance and parameters
- `SIGNING`: Creating blockchain transaction
- `SIGNED`: Transaction signed successfully
- `BROADCASTING`: Sending transaction to blockchain
- `BROADCASTED`: Transaction sent to blockchain (has txHash)
- `CONFIRMED`: Transaction confirmed on blockchain
- `FAILED`: Transaction failed (check error field)
- `CANCELED`: Transaction was canceled

**Error Responses:**

- **400 Bad Request**: Transaction ID is required
- **404 Not Found**: Transaction not found
- **500 Internal Server Error**: Server processing error

**Example using cURL:**

```bash
curl http://localhost:3000/api/withdrawal/status/41d4-e29b-550e8400-a716-446655440000
```

### 3. Get Request Queue Status

Returns the current status of the withdrawal request queue (for debugging/monitoring).

**Endpoint:** `GET /withdrawal/request-queue/status`

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "size": 5,
    "processing": 2
  },
  "timestamp": "2025-01-03T10:00:00Z"
}
```

**Response Fields:**

- `size`: Number of requests waiting in queue
- `processing`: Number of requests currently being processed (VALIDATING, SIGNING, or BROADCASTING states)

**Example using cURL:**

```bash
curl http://localhost:3000/api/withdrawal/request-queue/status
```

### 4. Get Transaction Queue Status

Returns the current status of the signed transaction queue (for debugging/monitoring).

**Endpoint:** `GET /withdrawal/tx-queue/status`

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "size": 3,
    "broadcasting": 1
  },
  "timestamp": "2025-01-03T10:00:00Z"
}
```

**Response Fields:**

- `size`: Number of signed transactions waiting in queue
- `broadcasting`: Number of transactions currently being broadcast

**Example using cURL:**

```bash
curl http://localhost:3000/api/withdrawal/tx-queue/status
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
