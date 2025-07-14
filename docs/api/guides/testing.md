# API Testing Guide

## Overview

This guide provides information on how to test the Withdrawal API effectively.

## Testing Tools

### 1. Swagger UI

Access the interactive API documentation at `http://localhost:8080/api-docs` to:

- Test endpoints directly from the browser
- View request/response schemas
- See example payloads

### 2. cURL

Quick command-line testing:

```bash
# Test health endpoint
curl http://localhost:8080/health

# Submit withdrawal
curl -X POST http://localhost:8080/withdrawal/request \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user","amount":"0.1","toAddress":"0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd","tokenAddress":"0x0000000000000000000000000000000000000000","network":"ethereum"}'
```

### 3. Postman

Import the OpenAPI specification:

1. Open Postman
2. Click "Import" → "Link"
3. Enter: `http://localhost:8080/api-docs.json`
4. Postman will generate a collection with all endpoints

### 4. Automated Testing

Use the provided example scripts in `/docs/api/examples/` for automated testing.

## Test Scenarios

### 1. Happy Path Testing

Test successful withdrawal flow:

```javascript
// 1. Submit withdrawal request
const submitResponse = await submitWithdrawal({
  userId: 'test-user-001',
  amount: '1.5',
  toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
  tokenAddress: '0x0000000000000000000000000000000000000000',
  network: 'ethereum',
});

// 2. Verify response structure
assert(submitResponse.success === true);
assert(submitResponse.data.id);
assert(submitResponse.data.status === 'pending');

// 3. Check status
const statusResponse = await checkStatus(submitResponse.data.id);
assert(statusResponse.success === true);
```

### 2. Error Testing

Test various error conditions:

```javascript
// Test missing fields
const missingFieldsTest = await submitWithdrawal({
  userId: 'test-user',
  // Missing other required fields
});
assert(missingFieldsTest.success === false);
assert(missingFieldsTest.error.includes('Missing required fields'));

// Test invalid amount
const invalidAmountTest = await submitWithdrawal({
  userId: 'test-user',
  amount: '-1',
  toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
  tokenAddress: '0x0000000000000000000000000000000000000000',
  network: 'ethereum',
});
assert(invalidAmountTest.success === false);
assert(invalidAmountTest.error === 'Invalid amount');
```

### 3. Load Testing

Test API performance under load:

```bash
# Using Apache Bench (ab)
ab -n 1000 -c 10 -p withdrawal.json -T application/json http://localhost:8080/withdrawal/request

# Using hey
hey -n 1000 -c 10 -m POST -H "Content-Type: application/json" -d '{"userId":"load-test","amount":"0.1","toAddress":"0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd","tokenAddress":"0x0000000000000000000000000000000000000000","network":"ethereum"}' http://localhost:8080/withdrawal/request
```

## Test Data

### Valid Test Addresses

#### Ethereum

- `0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd`
- `0x0000000000000000000000000000000000000000` (ETH token address)

#### Test User IDs

- `test-user-001`
- `test-user-002`
- `load-test-user`

### Test Amounts

- Minimum: `"0.000001"`
- Standard: `"1.0"`
- Large: `"1000.0"`

## Database Testing

### Check Transaction Records

```sql
-- View all transactions
SELECT * FROM transactions ORDER BY created_at DESC;

-- Check specific user's transactions
SELECT * FROM transactions WHERE user_id = 'test-user-001';

-- Check transaction status distribution
SELECT status, COUNT(*) FROM transactions GROUP BY status;
```

### Queue Monitoring

Monitor queue status during testing:

```bash
# Check queue status
curl http://localhost:8080/withdrawal/queue/status
```

## Integration Testing

### 1. End-to-End Flow

```python
import requests
import time

def test_withdrawal_flow():
    # 1. Submit withdrawal
    submit_resp = requests.post(
        "http://localhost:8080/withdrawal/request",
        json={
            "amount": "0.5",
            "toAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd",
            "tokenAddress": "0x0000000000000000000000000000000000000000",
            "network": "polygon"
        }
    )
    assert submit_resp.status_code == 201
    tx_id = submit_resp.json()["data"]["id"]

    # 2. Poll status until complete
    max_attempts = 30
    for i in range(max_attempts):
        status_resp = requests.get(
            f"http://localhost:8080/withdrawal/status/{tx_id}"
        )
        status = status_resp.json()["data"]["status"]

        if status in ["completed", "failed"]:
            break

        time.sleep(2)

    # 3. Verify final state
    assert status in ["completed", "failed"]
    print(f"Final status: {status}")
```

### 2. Concurrent Testing

Test concurrent withdrawal requests:

```javascript
async function testConcurrent() {
  const promises = [];

  // Submit 10 concurrent requests
  for (let i = 0; i < 10; i++) {
    promises.push(
      submitWithdrawal({
        amount: '0.1',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        network: 'polygon',
      })
    );
  }

  const results = await Promise.all(promises);

  // Verify all requests succeeded
  results.forEach(result => {
    assert(result.success === true);
  });
}
```

## Debugging Tips

1. **Enable Debug Logging:**

   ```bash
   DEBUG=* npm run dev
   ```

2. **Check Docker Logs:**

   ```bash
   docker-compose logs -f api-server
   docker-compose logs -f mysql
   ```

3. **Monitor Queue Processing:**
   - Check queue status endpoint regularly
   - Monitor worker logs for processing errors

4. **Database Queries:**
   - Use provided SQL queries to verify data
   - Check for orphaned transactions

## Performance Benchmarks

Expected performance metrics:

- Response time: < 100ms (p95)
- Throughput: > 100 requests/second
- Queue processing: < 5 seconds per transaction

## Security Testing

1. **Input Validation:**
   - Test SQL injection attempts
   - Test XSS payloads
   - Test oversized payloads

2. **Rate Limiting:**
   - Verify rate limits are enforced
   - Test burst traffic handling

3. **Authentication (Future):**
   - Test JWT validation
   - Test unauthorized access
