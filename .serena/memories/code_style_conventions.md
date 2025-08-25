# Code Style and Conventions

## TypeScript Guidelines

### Type Safety
- **Strict mode enabled** - All types must be properly defined
- **Avoid `any` type** - Use `unknown` or proper typing instead
- **Interface naming** - Use PascalCase without `I` prefix (e.g., `User` not `IUser`)
- **Type imports** - Use `import type` when importing only types

### Code Organization
- **Single Responsibility Principle** - Each function/class should do one thing
- **Small functions** - Keep functions focused and under 50 lines
- **Async/Await** - Use consistently for all asynchronous operations
- **Error handling** - Always use try-catch for async operations

### Naming Conventions
- **Files**: kebab-case (e.g., `user-service.ts`)
- **Classes**: PascalCase (e.g., `UserService`)
- **Functions/Methods**: camelCase (e.g., `getUserById`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`)
- **Interfaces/Types**: PascalCase (e.g., `WithdrawalRequest`)
- **Environment variables**: UPPER_SNAKE_CASE

### Project Structure Patterns
```typescript
// Service pattern
export class UserService {
  constructor(private readonly prisma: PrismaClient) {}
  
  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
}

// Controller pattern
export const userController = {
  async getUser(req: Request, res: Response) {
    try {
      const user = await userService.findById(req.params.id);
      res.json({ success: true, data: user });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

// Validation pattern (using Zod)
export const withdrawalRequestSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().positive(),
  toAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
});
```

## Database Conventions

### Prisma Usage
- **Always use Prisma ORM** - Never write raw SQL
- **Use transactions** for multi-record operations
- **Use select/include** to prevent N+1 queries
- **Handle errors** gracefully with proper messages

### Schema Conventions
- **Table names**: PascalCase singular (e.g., `User`, `WithdrawalRequest`)
- **Column names**: camelCase (e.g., `createdAt`, `userId`)
- **Relations**: Use explicit relation names
- **Indexes**: Add for frequently queried fields

### IMPORTANT: No Migration Generation
- **DO NOT** create Prisma migration files
- Document schema changes in `plan.md` only
- Migrations are created only when explicitly requested

## API Conventions

### RESTful Endpoints
```
GET    /resource          # List all
GET    /resource/:id      # Get one
POST   /resource          # Create
PUT    /resource/:id      # Update
DELETE /resource/:id      # Delete
```

### Response Format
```typescript
// Success response
{
  success: true,
  data: { ... },
  message?: "Optional success message"
}

// Error response
{
  success: false,
  error: "Error message",
  code?: "ERROR_CODE"
}
```

### Status Codes
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error

## Security Conventions

### Authentication
- Use JWT tokens with proper expiration
- Hash passwords with bcrypt (minimum 10 rounds)
- Validate all inputs using Zod schemas
- Never log sensitive information

### Error Handling
- Use custom error classes from `packages/shared/src/errors`
- Don't expose internal details in production
- Log errors with context for debugging
- Distinguish permanent vs retryable errors

## Testing Conventions

### Initial Tests
When creating new features, start with minimal test:
```typescript
describe('FeatureName', () => {
  it('should exist', () => {
    expect(true).toBe(true);
  });
});
```

### Comprehensive Tests (when requested)
- Test success and error cases
- Mock external dependencies
- Use descriptive test names
- Group related tests with `describe`
- Aim for >80% coverage on critical paths

## Documentation

### Code Comments
- **Minimal inline comments** - Code should be self-documenting
- **Complex logic** - Add brief explanations
- **TODOs** - Use format `// TODO: [description]`
- **JSDoc** - For public APIs only

### Language Requirements
- **All code, comments, documentation**: English only
- **Task Master tasks**: Korean (local team)
- **Jira issues**: English (global team)