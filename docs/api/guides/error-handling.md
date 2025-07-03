# Error Handling Guide

## Overview

This guide explains how to handle errors when using the Withdrawal API.

## HTTP Status Codes

The API uses standard HTTP status codes to indicate the success or failure of requests:

| Status Code | Description |
|-------------|-------------|
| 200 | Success - Request completed successfully |
| 201 | Created - Resource created successfully |
| 400 | Bad Request - Invalid request parameters |
| 404 | Not Found - Resource not found |
| 500 | Internal Server Error - Server error |

## Error Response Format

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error description",
  "timestamp": "2025-01-03T10:00:00Z"
}
```

## Common Errors

### 1. Missing Required Fields

**Status Code:** 400

**Example:**
```json
{
  "success": false,
  "error": "Missing required fields: userId, amount, toAddress, tokenAddress, network",
  "timestamp": "2025-01-03T10:00:00Z"
}
```

**How to fix:** Ensure all required fields are included in your request.

### 2. Invalid Amount

**Status Code:** 400

**Example:**
```json
{
  "success": false,
  "error": "Invalid amount",
  "timestamp": "2025-01-03T10:00:00Z"
}
```

**How to fix:** 
- Amount must be a valid number
- Amount must be greater than 0
- Amount should be provided as a string to avoid floating-point precision issues

### 3. Transaction Not Found

**Status Code:** 404

**Example:**
```json
{
  "success": false,
  "error": "Transaction not found",
  "timestamp": "2025-01-03T10:00:00Z"
}
```

**How to fix:** Verify the transaction ID is correct.

### 4. Internal Server Error

**Status Code:** 500

**Example:**
```json
{
  "success": false,
  "error": "Internal server error",
  "timestamp": "2025-01-03T10:00:00Z"
}
```

**How to fix:** This indicates a server-side issue. Please:
1. Retry the request after a short delay
2. If the error persists, contact support

## Error Handling Best Practices

### 1. Always Check Response Status

```javascript
// JavaScript example
try {
  const response = await fetch('/withdrawal/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  const result = await response.json();
  
  if (!result.success) {
    console.error('API Error:', result.error);
    // Handle error appropriately
  }
} catch (error) {
  console.error('Network Error:', error);
}
```

### 2. Implement Retry Logic

For transient errors (5xx status codes), implement exponential backoff:

```python
# Python example
import time
import requests

def submit_withdrawal_with_retry(data, max_retries=3):
    for attempt in range(max_retries):
        try:
            response = requests.post(
                'http://localhost:8080/withdrawal/request',
                json=data
            )
            
            if response.status_code == 500:
                # Wait before retrying (exponential backoff)
                wait_time = 2 ** attempt
                time.sleep(wait_time)
                continue
                
            return response.json()
            
        except requests.exceptions.RequestException as e:
            if attempt == max_retries - 1:
                raise
            time.sleep(2 ** attempt)
    
    raise Exception("Max retries exceeded")
```

### 3. Log Errors for Debugging

Always log error responses with relevant context:

```javascript
// Include request ID, timestamp, and parameters
console.error({
  timestamp: new Date().toISOString(),
  requestId: response.headers.get('x-request-id'),
  error: result.error,
  params: { userId, amount, network }
});
```

## Validation Guidelines

To minimize errors, validate input before sending requests:

1. **Amount Validation:**
   - Must be a positive number
   - Consider decimal precision for the specific token
   - Use string format to avoid floating-point issues

2. **Address Validation:**
   - Validate format based on network (e.g., 0x prefix for Ethereum)
   - Check address checksum if applicable

3. **Network Validation:**
   - Ensure network is supported
   - Match token address with correct network

## Support

If you encounter persistent errors or need assistance:
1. Check the API documentation
2. Review server logs if available
3. Contact the development team with error details