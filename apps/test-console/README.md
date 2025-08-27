# Test Console CLI

CLI tool for testing and monitoring the Asset Withdrawal System.

## Overview

The Test Console provides a comprehensive command-line interface for testing withdrawal requests, injecting error scenarios, monitoring transaction status, and running automated test scenarios.

## Features

- 🚀 **Normal Withdrawal Testing**: Send single or multiple withdrawal requests
- 🔥 **Error Injection**: Simulate various error scenarios for testing error handling
- 🔍 **Status Monitoring**: Check and watch transaction status in real-time
- 🎯 **Batch Testing**: Run predefined test scenarios (normal flow, stress test, error recovery)
- 💻 **Interactive Mode**: User-friendly prompts for easy testing
- 📊 **Metrics & Reporting**: Detailed performance metrics and test reports

## Installation

```bash
# Install dependencies from root
pnpm install

# Build the test console
npx nx build test-console
```

## Usage

### Interactive Mode (Default)

```bash
# Start interactive mode
npx nx serve test-console

# Or using tsx directly
cd apps/test-console
pnpm tsx src/main.ts
```

### Command Line Mode

#### Send Withdrawal Request

```bash
# Single request with default values
npx tsx src/main.ts request

# Multiple requests with custom values
npx tsx src/main.ts request \
  --amount 100 \
  --token 0x5FbDB2315678afecb367f032d93F642f64180aa3 \
  --to 0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd \
  --count 5 \
  --delay 500

# Output as JSON
npx tsx src/main.ts request --json
```

#### Inject Error Scenarios

```bash
# List available error types
npx tsx src/main.ts error --help

# Inject nonce collision error
npx tsx src/main.ts error --type nonce-collision --severity high

# Inject multiple errors
npx tsx src/main.ts error --type gas-exhaustion --count 3
```

Available error types:
- `nonce-collision`: Multiple transactions with same nonce
- `gas-exhaustion`: Request with extremely high amount
- `invalid-token`: Non-existent token address
- `rpc-failure`: RPC connection failure
- `malformed-message`: Invalid request data
- `network-delay`: Slow network conditions
- `db-lock`: Database lock with concurrent writes

#### Check Status

```bash
# Check specific request
npx tsx src/main.ts status --id <request-id>

# Check all recent requests
npx tsx src/main.ts status --all

# Watch status in real-time
npx tsx src/main.ts status --watch --interval 2000

# Watch specific request
npx tsx src/main.ts status --watch --id <request-id>
```

#### Run Test Scenarios

```bash
# Run normal flow test
npx tsx src/main.ts batch --scenario normal-flow --requests 10

# Run stress test
npx tsx src/main.ts batch --scenario stress-test --requests 100 --duration 60

# Run error recovery test
npx tsx src/main.ts batch --scenario error-recovery --requests 20

# Run mixed scenario with reporting
npx tsx src/main.ts batch --scenario mixed --requests 50 --report --json --csv
```

Available scenarios:
- `normal-flow`: Standard withdrawal requests with normal timing
- `stress-test`: High concurrency stress testing
- `error-recovery`: Test error handling and recovery mechanisms
- `mixed`: Combination of normal, burst, and error scenarios

## Environment Configuration

Create `.env.test` file in test-console directory:

```env
# API Configuration
API_URL=http://localhost:8080
SQS_ENDPOINT=http://localhost:4566
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

# Default Test Values
TEST_WALLET_ADDRESS=0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd
DEFAULT_TOKEN=0x5FbDB2315678afecb367f032d93F642f64180aa3
DEFAULT_AMOUNT=50
DEFAULT_CHAIN=localhost
DEFAULT_NETWORK=testnet

# Performance Settings
MAX_CONCURRENT_REQUESTS=10
REQUEST_DELAY_MS=100
TIMEOUT_MS=30000

# Output Settings
OUTPUT_FORMAT=table
METRICS_ENABLED=true
LOG_LEVEL=info
```

## Reports

Test reports are generated in the `reports/` directory:

- **JSON Report**: Detailed test results in JSON format
- **CSV Report**: Metrics summary for spreadsheet analysis
- **Markdown Report**: Human-readable test summary

Example report structure:
```
reports/
├── normal-flow-2024-08-26T10-30-00.json
├── normal-flow-2024-08-26T10-30-00.csv
└── normal-flow-2024-08-26T10-30-00.md
```

## Development

### Project Structure

```
test-console/
├── src/
│   ├── main.ts              # CLI entry point
│   ├── commands/            # Command implementations
│   │   ├── request.ts       # Withdrawal request command
│   │   ├── error.ts         # Error injection command
│   │   ├── status.ts        # Status monitoring command
│   │   └── batch.ts         # Batch testing command
│   └── utils/               # Utility functions
│       ├── api-client.ts    # API client wrapper
│       └── interactive.ts   # Interactive mode handler
├── .env.test                # Environment configuration
├── package.json             # Dependencies
└── README.md                # This file
```

### Adding New Commands

1. Create command file in `src/commands/`
2. Implement command handler function
3. Register command in `src/main.ts`
4. Update interactive mode if needed

### Adding New Error Scenarios

1. Add scenario to `scenarios` object in `src/commands/error.ts`
2. Implement error injection logic
3. Update documentation

## Testing the Test Console

```bash
# Run lint
npx nx lint test-console

# Build
npx nx build test-console

# Test commands
npx tsx src/main.ts --help
npx tsx src/main.ts request --help
npx tsx src/main.ts error --help
npx tsx src/main.ts status --help
npx tsx src/main.ts batch --help
```

## Tips

- Use `--json` flag for machine-readable output
- Use `--watch` mode for continuous monitoring
- Generate reports after batch testing for detailed analysis
- Start with interactive mode for exploration
- Use batch scenarios for automated testing

## Troubleshooting

### API Connection Issues

Make sure the API server is running:
```bash
docker-compose -f docker/docker-compose.yaml up -d
pnpm run dev:api
```

### Missing Dependencies

Install dependencies from root:
```bash
pnpm install
```

### Build Errors

Clean and rebuild:
```bash
npx nx clean test-console
npx nx build test-console --skip-nx-cache
```