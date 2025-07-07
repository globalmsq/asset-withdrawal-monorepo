# Plan: Create Comprehensive Test Files for JWT Authentication

## Todo List

- [ ] Create test file for AuthService (`auth.service.test.ts`)
  - Test `hashPassword` method
  - Test `comparePassword` method  
  - Test `generateToken` method
  - Test `verifyToken` method
  - Test `getExpiresInSeconds` method
  - Test error cases and edge cases

- [ ] Create test file for auth middleware (`auth.middleware.test.ts`)
  - Test `authenticate` middleware
    - Valid token scenario
    - Missing authorization header
    - Invalid authorization format
    - Invalid/expired token
  - Test `authorize` middleware
    - Valid role authorization
    - Missing user context
    - Insufficient permissions

- [ ] Create test file for auth routes (`auth.routes.test.ts`)
  - Test `/auth/register` endpoint
    - Successful registration
    - Missing required fields
    - User already exists
    - Database errors
  - Test `/auth/login` endpoint
    - Successful login
    - Missing credentials
    - Invalid credentials
    - Database errors
  - Test `/auth/me` endpoint
    - Successful user info retrieval
    - User not found
    - Authentication required

- [ ] Create test file for UserService (`user-service.test.ts`)
  - Test `createUser` method
  - Test `findByEmail` method
  - Test `findById` method
  - Test `updateUser` method
  - Test `deleteUser` method
  - Test `findMany` method
  - Mock Prisma client appropriately

## Approach

1. Follow the existing test patterns from `withdrawal.test.ts`
2. Use Jest with supertest for API route testing
3. Mock external dependencies (database, JWT, bcrypt)
4. Ensure comprehensive coverage including edge cases
5. Maintain consistency with existing test structure

## Review

(To be completed after implementation)