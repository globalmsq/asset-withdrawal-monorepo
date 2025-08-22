# Development Workflow

## Git Workflow

### Branch Strategy
- **Main branch**: Protected, requires PR approval
- **Feature branches**: `[JIRA-KEY]_descriptive-name`
- **Never work directly on main**
- **Use parent task's Jira key for branch naming**

### Commit Message Format
```
[BFS-XX] type: description

Types:
- feat: New feature
- fix: Bug fix
- docs: Documentation changes
- style: Code formatting (no logic changes)
- refactor: Code refactoring
- test: Test additions/modifications
- chore: Build/configuration changes
```

### Pull Request Process
1. Create feature branch from main
2. Make changes and commit with Jira key
3. Push branch to remote
4. Create PR with title: `[JIRA-KEY] Description`
5. Update Task Master status to review
6. Wait for approval and merge

## Task Master Integration

### Task Lifecycle
```
pending → in-progress → review → done
         ↓
      blocked (if dependencies)
```

### Commands for Task Management
```bash
# Daily workflow
npx task-master next                           # Find next task
npx task-master show <id>                      # View details
npx task-master set-status --id=<id> --status=in-progress
npx task-master update-subtask --id=<id> --prompt="notes"
npx task-master set-status --id=<id> --status=done

# Planning
npx task-master expand --id=<id> --research    # Break into subtasks
npx task-master analyze-complexity --research  # Analyze complexity
```

## Jira Synchronization

### Status Mapping
- Task Master `pending` → Jira "BACKLOG"
- Task Master `in-progress` → Jira "IN PROGRESS"
- Task Master `done` → Jira "DONE"
- Task Master `blocked` → Jira "IN PROGRESS" + comment

### Language Requirements
- **Task Master**: Korean (local team)
- **Jira**: English (global team)
- **Code/Documentation**: English only

### EPIC Association
- All Story/Task issues must link to EPIC
- Sub-tasks link to Story/Task (not EPIC)
- Main EPIC: BFS-1 (Asset Withdrawal System)

## Development Environment

### Docker Services
```yaml
Services:
- MySQL: Port 3306
- Redis: Port 6379
- LocalStack: Port 4566
- SQS Admin UI: Port 3999
- Hardhat Node: Port 8545 (optional)
```

### Environment Setup
1. Copy `.env.example` to `.env`
2. Configure required variables
3. Start Docker services
4. Initialize LocalStack queues
5. Run database migrations
6. Start development servers

### Service Ports
- API Server: 3000
- Signing Service: 3002
- TX Monitor: 3003
- TX Broadcaster: 3004
- Account Manager: 3005
- Admin UI: 3006

## Code Review Process

### Before Submitting PR
1. Run all quality checks
2. Ensure tests pass (if any)
3. Update documentation if needed
4. Self-review changes
5. Check for console.logs and debug code

### PR Description Template
```markdown
## Summary
Brief description of changes

## Changes Made
- List of specific changes
- Technical decisions made

## Testing
- How to test the changes
- Test cases covered

## Checklist
- [ ] Code follows project conventions
- [ ] Quality checks pass
- [ ] Documentation updated
- [ ] Tests added/updated (if applicable)
```

## Debugging Tips

### LocalStack Issues
```bash
# Check if LocalStack is running
docker ps | grep localstack

# View LocalStack logs
docker logs localstack_main

# Recreate queues
./docker/scripts/init-localstack.sh
```

### Database Issues
```bash
# Reset database
pnpm run db:reset

# Regenerate Prisma client
pnpm run db:generate

# Open Prisma Studio
pnpm run db:studio
```

### Port Conflicts
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>
```

## Performance Considerations

### Database Queries
- Use Prisma's `include` for relations
- Implement pagination for large datasets
- Use `select` to limit returned fields
- Add indexes for frequently queried fields

### Queue Processing
- Batch messages when possible
- Implement exponential backoff for retries
- Use DLQ for permanent failures
- Monitor queue depth and processing rate

### Blockchain Operations
- Use Multicall3 for batch operations
- Implement nonce management with Redis
- Cache gas prices and update periodically
- Handle network congestion gracefully