# Withdrawal API Documentation

## Overview

The Withdrawal API provides a RESTful interface for submitting and tracking cryptocurrency withdrawal requests. This API is designed to handle high-volume withdrawal operations with reliability and security.

## Key Features

- **RESTful API** with JSON responses
- **Swagger/OpenAPI** documentation
- **Queue-based processing** for scalability
- **Real-time status tracking**
- **Multi-network support** (Ethereum, BSC, etc.)

## Documentation Structure

```
docs/api/
├── README.md              # This file
├── openapi/              # OpenAPI specifications (auto-generated)
├── guides/               # Usage guides
│   ├── getting-started.md
│   ├── error-handling.md
│   └── testing.md
├── examples/             # Code examples
│   ├── curl/            # cURL examples
│   ├── nodejs/          # Node.js examples
│   └── python/          # Python examples
├── endpoints/            # Detailed endpoint documentation
│   └── withdrawal.md
└── changelog/           # API version history
```

## Quick Links

- **[Getting Started Guide](./guides/getting-started.md)** - Start here if you're new
- **[API Reference](http://localhost:8080/api-docs)** - Interactive Swagger documentation
- **[Example Code](./examples/)** - Ready-to-use code examples
- **[Error Handling](./guides/error-handling.md)** - How to handle API errors
- **[Testing Guide](./guides/testing.md)** - Testing strategies and tools

## API Endpoints

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/withdrawal/request` | Submit a new withdrawal request |
| GET | `/withdrawal/status/:id` | Check withdrawal status |
| GET | `/withdrawal/queue/status` | Get queue status (debugging) |

### Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | API health check |

## Request/Response Format

All API requests and responses use JSON format.

### Request Headers
```
Content-Type: application/json
```

### Response Format
```json
{
  "success": true,
  "data": {
    // Response data
  },
  "timestamp": "2025-01-03T10:00:00Z"
}
```

## Authentication

Currently, the API does not require authentication. Future versions will implement JWT-based authentication.

## Rate Limiting

Rate limiting is not currently implemented but is planned for future releases.

## Support

For questions or issues:
1. Check the [documentation](./guides/)
2. Review [error handling guide](./guides/error-handling.md)
3. Contact the development team

## Version

Current API Version: 1.0.0

## License

This API is proprietary software. All rights reserved.