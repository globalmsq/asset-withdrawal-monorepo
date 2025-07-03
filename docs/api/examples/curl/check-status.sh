#!/bin/bash

# Check Withdrawal Status Example - cURL

# Replace with actual transaction ID
TX_ID="tx-1234567890-abc123def"

# Check withdrawal status
curl -X GET "http://localhost:8080/withdrawal/status/${TX_ID}" \
  -H "Content-Type: application/json"

# Expected response:
# {
#   "success": true,
#   "data": {
#     "id": "tx-1234567890-abc123def",
#     "status": "completed",
#     "transactionHash": "0x123abc...",
#     "createdAt": "2025-01-03T10:00:00Z",
#     "updatedAt": "2025-01-03T10:05:00Z"
#   },
#   "timestamp": "2025-01-03T10:05:00Z"
# }