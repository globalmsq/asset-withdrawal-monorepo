# CLAUDE.md - Asset Withdrawal System Development Guide

## Project Overview

This is a Polygon-focused blockchain withdrawal system built with TypeScript, Express, and Prisma. The system handles cryptocurrency withdrawal requests on the Polygon network, processes transactions securely using AWS SQS (LocalStack for development), and tracks transaction status.


## Task-Jira Integration Guidelines

### General Synchronization Rules

#### Definition of Jira Synchronization
Jira synchronization means creating, updating, and maintaining consistency between Task Master tasks/subtasks and their corresponding Jira issues. This includes:
- Creating new Jira issues for Task Master tasks that don't have them
- Recording Jira keys in Task Master tasks
- Updating Task Master titles to include `[PROJECT-KEY]` prefix
- Keeping status synchronized between both systems

#### Important Rules
1. **Task Master Titles**: Include Jira key as prefix `[PROJECT-KEY]` in Task Master task titles
2. **Jira Issue Titles**: Keep original titles in Jira without prefix (to avoid duplication)
3. **JSON Storage**: Store Jira key in `jiraKey` field in tasks.json
4. **Title Updates**: When updating Task Master titles, DO NOT update Jira issue titles
5. **Bidirectional Sync**: Both Task Master and Jira should always reflect the same status
6. **Language**: When creating or updating Jira issues, always use English for titles, descriptions, and comments

#### Complete Synchronization Workflow

##### 1. Creating New Tasks
When a new task is created in Task Master:
1. Create task in Task Master
2. Create corresponding Jira issue (Story for main tasks, Sub-task for subtasks)
3. Add Jira key to tasks.json `jiraKey` field
4. Update Task Master title to include `[PROJECT-KEY]` prefix
5. Ensure both systems show the same initial status

##### 2. Starting Work on a Task
**MANDATORY**: When beginning any task:
1. Update Task Master status: `task-master set-status --id=<id> --status=in-progress`
2. Immediately sync to Jira: Transition the Jira issue to "IN PROGRESS" status
3. Add a comment in Jira indicating work has started (optional but recommended)

##### 3. During Development
- Add implementation notes to subtasks using `task-master update-subtask`
- Optionally update Jira with progress comments
- Keep both systems as source of truth for different audiences:
  - Task Master: Technical implementation details
  - Jira: Team collaboration and stakeholder visibility

##### 4. Completing a Task
**MANDATORY**: When finishing any task:
1. Update Task Master status: `task-master set-status --id=<id> --status=done`
2. Immediately sync to Jira: Transition the Jira issue to "DONE" status
3. Add completion notes to Jira with summary of what was implemented

##### 5. Status Mapping
- Task Master `pending` → Jira "BACKLOG" or "Selected for Development"
- Task Master `in-progress` → Jira "IN PROGRESS"
- Task Master `done` → Jira "DONE"
- Task Master `blocked` → Jira "IN PROGRESS" + comment explaining blocker
- Task Master `deferred` → Jira "BACKLOG" + comment
- Task Master `cancelled` → Jira "CANCELLED" or close with resolution

#### MCP Atlassian Integration
Claude Code can directly update Jira statuses using the MCP Atlassian server configured in `.mcp.json`. This enables seamless synchronization between Task Master and Jira without manual intervention.


## Development Workflow

### 1. Planning Phase

- First, thoroughly analyze the problem and read relevant codebase files
- Write a detailed plan to `plan.md` with specific todo items
- Check in with the developer before starting implementation
- Keep all changes simple and minimal - avoid complex modifications

### 2. Implementation Guidelines

#### Code Style

- Use TypeScript strictly - ensure all types are properly defined
- Follow existing patterns in the codebase
- Keep functions small and focused (single responsibility)
- Use async/await consistently for asynchronous operations
- All code, comments, and documentation must be in English

#### Database Operations

- Always use Prisma for database queries - never write raw SQL
- Use transactions for operations that modify multiple records
- Handle database errors gracefully with proper error messages

#### API Development

- Follow RESTful conventions for endpoints
- Always validate request data using existing validators in `packages/shared/src/validators`
- Return consistent response formats using existing response utilities
- Include proper error handling with appropriate HTTP status codes

#### Security Practices

- Never expose sensitive information in logs or responses
- Always hash passwords using bcrypt before storing
- Use JWT tokens for authentication (already set up)
- Validate all user inputs thoroughly
- Check user permissions before performing sensitive operations

### 3. Database Guidelines

- **NO MIGRATION GENERATION**: Do not create Prisma migration files
- Schema changes should be documented in plan.md only
- Migration files will be created only when explicitly requested
- Use existing schema for development

### 4. Testing Requirements

- Write tests for all new endpoints using Jest and Supertest
- Test both success and error cases
- Mock external dependencies (database, blockchain services, SQS)
- Run tests before marking any task as complete:
  ```bash
  npm test
  ```

### 5. Before Completing Tasks

Always run these commands to ensure code quality:

```bash
npm run lint        # Check code style
npm run typecheck   # Check TypeScript types
npm test           # Run all tests
```

### 6. Documentation

- Update API documentation if you modify endpoints
- Keep inline comments minimal - code should be self-explanatory
- Update relevant documentation files if making architectural changes

## Project-Specific Commands

### Development

```bash
npm run dev         # Start development server
npm run build       # Build all packages
npm run serve       # Start production server
```

### Database

```bash
npm run db:migrate  # Run database migrations
npm run db:seed     # Seed database with test data
npm run db:reset    # Reset database (careful!)
```

### Docker

```bash
# Start all services (MySQL, LocalStack, SQS Admin UI)
docker-compose -f docker/docker-compose.yaml up -d

# Start LocalStack for SQS (if using separate file)
docker-compose -f docker/docker-compose.localstack.yaml up -d

# Initialize LocalStack queues
./docker/scripts/init-localstack.sh

# View logs
docker-compose -f docker/docker-compose.yaml logs -f
```

### SQS Admin UI

A web UI for monitoring and managing SQS queues in development environment:

- **Access URL**: http://localhost:3999
- **Key Features**:
  - View queue list and monitor message counts
  - Inspect and search message contents
  - Send test messages manually
  - Delete and reprocess messages
  - Manage Dead Letter Queues

This tool is useful for visually monitoring queue states and debugging during development.

## Architecture Notes

### Microservices Structure

- `/apps/withdrawal-api`: Handles withdrawal requests
- `/apps/tx-processor`: Processes and signs transactions
- `/apps/tx-monitor`: Monitors transaction status
- `/packages/database`: Shared database service layer
- `/packages/shared`: Shared types, utilities, and queue interfaces

### Queue System Architecture

#### Development Environment (LocalStack)
- Uses LocalStack to emulate AWS SQS
- Queues created automatically via initialization script
- Access via `http://localhost:4566`

#### Production Environment (AWS SQS)
- Direct AWS SQS integration
- IAM roles for queue access
- Dead Letter Queues for error handling

#### Queue Interface
```typescript
interface IQueue<T> {
  sendMessage(data: T): Promise<void>;
  receiveMessages(maxMessages?: number): Promise<Message<T>[]>;
  deleteMessage(receiptHandle: string): Promise<void>;
  getQueueUrl(): string;
}
```

### Polygon Network Integration

#### Supported Networks
- **Amoy Testnet** (Chain ID: 80002) - Development
- **Polygon Mainnet** (Chain ID: 137) - Production

#### Transaction Types
- ERC-20 token transfers only
- EIP-1559 transaction format
- Gas optimization for Polygon network

### App Naming Convention

Apps should be named based on their primary function:
- `{action}-{target}`: e.g., `withdrawal-api`, `tx-processor`
- Avoid generic names like `api-server` or `worker`
- Each app should have a single, well-defined responsibility

### Key Technologies

- **Prisma**: ORM for MySQL database
- **Express**: Web framework
- **JWT**: Authentication
- **Ethers.js**: Polygon blockchain interaction
- **AWS SDK**: SQS queue management
- **LocalStack**: Local AWS service emulation
- **Nx**: Monorepo management
- **Docker**: Containerization

### Environment Variables

```bash
# Queue Configuration
QUEUE_TYPE=localstack          # 'localstack' or 'aws'
AWS_ENDPOINT=http://localhost:4566
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=test         # LocalStack default
AWS_SECRET_ACCESS_KEY=test     # LocalStack default

# Polygon Configuration
POLYGON_NETWORK=amoy           # 'amoy' or 'mainnet'
POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
POLYGON_CHAIN_ID=80002         # 80002 for Amoy, 137 for Mainnet

# Application Ports
WITHDRAWAL_API_PORT=3000
TX_PROCESSOR_PORT=3001
TX_MONITOR_PORT=3002
```

Never commit `.env` files.

## Common Tasks

### Adding a New API Endpoint

1. Define route in appropriate router file
2. Create validator in `packages/shared/src/validators`
3. Implement service logic in services directory
4. Add tests for the endpoint
5. Update API documentation

### Modifying Database Schema

1. Update Prisma schema in `prisma/schema.prisma`
2. Run `npm run db:migrate` to create migration
3. Update relevant TypeScript types
4. Test thoroughly with existing data

### Error Handling

- Use custom error classes from `packages/shared/src/errors`
- Always catch and handle errors appropriately
- Log errors with sufficient context for debugging

## Review Process

After completing tasks:

1. Add a review section to `plan.md` summarizing all changes
2. List any potential impacts or considerations
3. Suggest any follow-up tasks if needed
4. Provide high-level explanation of changes made

Remember: Simplicity is key. Make minimal changes that achieve the goal effectively.

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md
