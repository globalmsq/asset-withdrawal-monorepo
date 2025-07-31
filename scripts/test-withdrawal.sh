#!/bin/bash

# Send 10 withdrawal requests to trigger batch processing
echo "Sending withdrawal requests to trigger batch processing..."

for i in {1..10}; do
  echo "Sending request $i..."
  curl -X POST http://localhost:8080/withdrawal/request \
    -H "Content-Type: application/json" \
    -d '{
      "amount": "50",
      "toAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd",
      "tokenAddress": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      "symbol": "mUSDT",
      "chain": "localhost",
      "network": "testnet"
    }' \
    -s | jq '.data.id' || echo "Request $i failed"
  
  sleep 0.5
done

echo "All requests sent. Waiting for batch processing..."
sleep 5

# Check signing service logs for approve
echo "Checking for approve transactions..."
docker logs withdrawal-signing-service --since 30s | grep -E "allowance|approve|Approve|Insufficient" || echo "No approve logs found"