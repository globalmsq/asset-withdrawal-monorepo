# Getting Started with Withdrawal API

## Overview

The Withdrawal API allows you to submit and track cryptocurrency withdrawal requests. This guide will help you get started with the API.

## Base URL

```
http://localhost:8080
```

## API Documentation

Interactive API documentation is available at:

- Swagger UI: `http://localhost:8080/api-docs`
- OpenAPI Spec: `http://localhost:8080/api-docs.json`

## Quick Start

### 1. Submit a Withdrawal Request

To submit a withdrawal request, send a POST request to `/withdrawal/request`:

```bash
curl -X POST http://localhost:8080/withdrawal/request \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "0.5",
    "toAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd",
    "tokenAddress": "0x0000000000000000000000000000000000000000",
    "network": "polygon"
  }'
```

### 2. Check Withdrawal Status

To check the status of a withdrawal, use the transaction ID returned from the request:

```bash
curl -X GET http://localhost:8080/withdrawal/status/tx-1234567890-abc123def
```

## Response Format

All API responses follow a consistent format:

```json
{
  "success": true,
  "data": {
    // Response data
  },
  "timestamp": "2025-01-03T10:00:00Z"
}
```

Error responses include an error message:

```json
{
  "success": false,
  "error": "Error description",
  "timestamp": "2025-01-03T10:00:00Z"
}
```

## Next Steps

- [Error Handling Guide](./error-handling.md)
- [Testing Guide](./testing.md)
- [Example Code](../examples/)
