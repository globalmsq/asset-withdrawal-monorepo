# Database Library

A simple database library using MySQL + Prisma ORM.

## Setup

1. Set up environment variables:
   ```bash
   cp env.example .env
   ```

2. Configure MySQL environment variables:
   ```bash
   # Set the following variables in .env file
   MYSQL_HOST=localhost
   MYSQL_PORT=3306
   MYSQL_USER=root
   MYSQL_PASSWORD=your_password
   MYSQL_DATABASE=withdrawal_system
   ```

3. Generate Prisma client:
   ```bash
   npx prisma generate
   ```

4. Run database migrations:
   ```bash
   npx prisma migrate dev
   ```

## Usage

### Database Service

```typescript
import { DatabaseService } from 'database';

const dbService = DatabaseService.getInstance();
await dbService.connect();

// Use Prisma client directly
const prisma = dbService.getClient();
const users = await prisma.user.findMany();
```

### Transaction Service

```typescript
import { TransactionService } from 'database';

const transactionService = new TransactionService();

// Create transaction
const transaction = await transactionService.createTransaction({
  userId: 'user123',
  amount: 100.5,
  currency: 'ETH',
  status: 'pending'
});

// Get user transactions
const userTransactions = await transactionService.getTransactionsByUserId('user123');
```

## Environment Variables

### Development Environment
```bash
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=pass
MYSQL_DATABASE=withdrawal_system
```

### Production Environment
```bash
MYSQL_HOST=your-production-host.com
MYSQL_PORT=3306
MYSQL_USER=your_production_user
MYSQL_PASSWORD=your_secure_password
MYSQL_DATABASE=withdrawal_system
```

### Docker Compose Environment
When using Docker Compose, use the service name as the host:
```bash
MYSQL_HOST=mysql  # docker-compose service name
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=pass
MYSQL_DATABASE=withdrawal_system
```

## Schema

Currently supported models:
- **Transaction**: Withdrawal transaction information
- **User**: User information

See `prisma/schema.prisma` file for detailed schema.

## Database Commands

```bash
# Generate Prisma client
yarn db:generate

# Run development migration
yarn db:migrate

# Launch Prisma Studio (Database GUI)
yarn db:studio

# Apply production migrations
npx prisma migrate deploy
```