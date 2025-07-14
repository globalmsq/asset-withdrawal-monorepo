# Database Migration Guide

## Overview

This document describes the database schema changes required for the recent updates to the withdrawal system.

## Changes Required

### 1. WithdrawalRequest Table Changes

#### Modified Columns:
- `requestId` - Changed from VARCHAR(50) to VARCHAR(36) to accommodate UUID v4 format
- `network` - Changed from VARCHAR(20) to VARCHAR(50) to store combined blockchain_network format

#### New Columns:
- `symbol` - VARCHAR(10) NULLABLE - Stores the token symbol (e.g., USDT, MSQ, MATIC)
- `blockchain` - VARCHAR(20) NULLABLE - Stores the blockchain name (e.g., polygon, bsc)

#### New Index:
- Added index on `createdAt` column for better time-based queries with rearranged UUID

### 2. Transaction Table Changes

#### Modified Columns:
- `requestId` - Changed from VARCHAR(50) to VARCHAR(36) to match UUID format

## Migration SQL

```sql
-- Modify WithdrawalRequest table
ALTER TABLE withdrawal_requests
  MODIFY COLUMN requestId VARCHAR(36) NOT NULL,
  MODIFY COLUMN network VARCHAR(50) NOT NULL,
  ADD COLUMN symbol VARCHAR(10) NULL AFTER currency,
  ADD COLUMN blockchain VARCHAR(20) NULL AFTER network,
  ADD INDEX idx_created_at (createdAt);

-- Modify Transaction table
ALTER TABLE transactions
  MODIFY COLUMN requestId VARCHAR(36) NULL;
```

## Rollback SQL

```sql
-- Rollback WithdrawalRequest table changes
ALTER TABLE withdrawal_requests
  DROP INDEX idx_created_at,
  DROP COLUMN blockchain,
  DROP COLUMN symbol,
  MODIFY COLUMN network VARCHAR(20) NOT NULL,
  MODIFY COLUMN requestId VARCHAR(50) NOT NULL;

-- Rollback Transaction table changes
ALTER TABLE transactions
  MODIFY COLUMN requestId VARCHAR(50) NULL;
```

## Data Migration Notes

1. **Existing requestId values**: The old format `tx-{timestamp}-{random}` will need to be migrated to the new UUID format `{part3}-{part2}-{part1}-{part4}-{part5}`.

2. **Network field**: For existing records, the network field should remain as-is (e.g., "polygon").

3. **New fields default values**:
   - `symbol`: Can be set to NULL for existing records or populated based on tokenAddress
   - `blockchain`: Should be set to "polygon" for all existing records

## Application Changes

1. **Request ID Generation**: Now uses UUID v4 with rearranged parts for time-based sorting
   - Old format: `tx-1752475048222-lgenf4d8r`
   - New format: `41d4-e29b-550e8400-a716-446655440000`

2. **Symbol Validation**: The API now accepts an optional `symbol` parameter that must match the token configuration

3. **Network Format**: While the database supports combined format, the current implementation still uses simple network names

## Testing After Migration

1. Verify all existing withdrawal requests are accessible
2. Test creating new withdrawal requests with symbol parameter
3. Ensure UUID generation and sorting works correctly
4. Verify all API endpoints return data in the expected format

## Generate Prisma Migration

To generate the migration file using Prisma:

```bash
npx prisma migrate dev --name add_symbol_and_uuid_support
```

This will create a new migration file in the `prisma/migrations` directory.