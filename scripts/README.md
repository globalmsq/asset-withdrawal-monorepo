# Development Scripts

This directory contains utility scripts for development, testing, and maintenance of the Asset Withdrawal System.

## Scripts Overview

### Nonce Management
- `fix-nonce-gap.js` - Utility to fix nonce gaps in transaction processing
- `send-nonce-filler.js` - Script to fill missing nonces in the sequence

### Testing & Verification
- `test-sqs-search.js` - Test script for SQS missing nonce search functionality
- `test-withdrawal.sh` - Shell script for testing withdrawal flow

### Blockchain Utilities
- `check-allowance.js` - Check token allowances for withdrawal accounts
- `reset-allowance.js` - Reset token allowances (for development/testing)

## Usage

These scripts are primarily for development and debugging purposes. Make sure to:

1. Configure your environment variables properly
2. Use test networks for development scripts
3. Review script contents before execution in production environments

## Requirements

- Node.js 18+
- Proper environment configuration (.env files)
- Access to blockchain networks and SQS queues