# CLAUDE.md - Asset Withdrawal System Development Guide

## Project Overview

This is a blockchain asset withdrawal system built with TypeScript, Express, and Prisma. The system handles cryptocurrency withdrawal requests, processes transactions securely, and tracks them on various blockchain networks.

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

### 3. Testing Requirements

- Write tests for all new endpoints using Jest and Supertest
- Test both success and error cases
- Mock external dependencies (database, blockchain services)
- Run tests before marking any task as complete:
  ```bash
  npm test
  ```

### 4. Before Completing Tasks

Always run these commands to ensure code quality:

```bash
npm run lint        # Check code style
npm run typecheck   # Check TypeScript types
npm test           # Run all tests
```

### 5. Documentation

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
docker-compose up -d     # Start all services
docker-compose down      # Stop all services
docker-compose logs -f   # View logs
```

## Architecture Notes

### Monorepo Structure

- `/apps/api-server`: Main API application
- `/packages/database`: Database service layer
- `/packages/shared`: Shared types and utilities

### Key Technologies

- **Prisma**: ORM for MySQL database
- **Express**: Web framework
- **JWT**: Authentication
- **Nx**: Monorepo management
- **Docker**: Containerization

### Environment Variables

Check `.env.example` for required environment variables. Never commit `.env` files.

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
