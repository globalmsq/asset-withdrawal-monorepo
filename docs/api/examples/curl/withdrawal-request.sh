#!/bin/bash

# Withdrawal Request Example - cURL

# Submit a withdrawal request
curl -X POST http://localhost:8080/withdrawal/request \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "0.5",
    "toAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd",
    "tokenAddress": "0x0000000000000000000000000000000000000000",
    "network": "polygon"
  }'

# Expected response:
# {
#   "success": true,
#   "data": {
#     "id": "tx-1234567890-abc123def",
#     "status": "pending",
#     "createdAt": "2025-01-03T10:00:00Z",
#     "updatedAt": "2025-01-03T10:00:00Z"
#   },
#   "timestamp": "2025-01-03T10:00:00Z"
# }