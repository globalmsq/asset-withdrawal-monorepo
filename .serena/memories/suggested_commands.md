# Essential Commands for Asset Withdrawal System

## Development Commands

### Quick Start
```bash
# Start all Docker services (MySQL, LocalStack, Redis)
docker-compose -f docker/docker-compose.yaml up -d

# Initialize LocalStack queues
./docker/scripts/init-localstack.sh

# Start development servers
pnpm run dev

# View Docker logs
docker-compose -f docker/docker-compose.yaml logs -f
```

### Code Quality (MANDATORY after any code changes)
```bash
pnpm run lint        # Check code style
pnpm run typecheck   # Check TypeScript types
pnpm run format      # Check code formatting
pnpm run depcheck    # Check for unused dependencies

# Fix issues automatically
pnpm run lint:fix
pnpm run format:fix

# Run all checks at once
pnpm run check
```

### Database Commands
```bash
pnpm run db:generate  # Generate Prisma client
pnpm run db:migrate   # Run database migrations
pnpm run db:studio    # Open Prisma Studio GUI
pnpm run db:seed      # Seed database with test data
pnpm run db:reset     # Reset database (CAUTION!)
```

### Testing
```bash
pnpm run test         # Run all tests
pnpm run coverage     # Run tests with coverage report
```

### Building & Production
```bash
pnpm run build        # Build all packages
pnpm run serve        # Start production server
```

## Task Management Commands

### Task Master
```bash
npx task-master list                          # Show all tasks
npx task-master next                          # Get next task to work on
npx task-master show <id>                     # View task details
npx task-master set-status --id=<id> --status=in-progress  # Start task
npx task-master set-status --id=<id> --status=done         # Complete task
npx task-master update-subtask --id=<id> --prompt="notes"  # Add notes
```

### Git Workflow
```bash
# Create feature branch (use Jira key from task)
git checkout -b BFS-XX_feature-name

# Commit with Jira key prefix
git commit -m "[BFS-XX] feat: description"

# Create pull request
gh pr create --title "[BFS-XX] Feature name" --body "Description..."
```

## Service Endpoints

- API Server: http://localhost:3000
- Swagger Docs: http://localhost:3000/api-docs
- Admin UI: http://localhost:3006
- SQS Admin UI: http://localhost:3999
- LocalStack: http://localhost:4566
- MySQL: localhost:3306
- Redis: localhost:6379

## System Commands (macOS)

```bash
# File operations
ls -la              # List files with details
find . -name "*.ts" # Find TypeScript files
grep -r "pattern"   # Search for pattern in files
rg "pattern"        # Faster search with ripgrep

# Process management
ps aux | grep node  # Find Node.js processes
lsof -i :3000      # Check what's using port 3000
kill -9 <PID>      # Force kill process

# Docker
docker ps          # List running containers
docker logs <container> -f  # Follow container logs
docker exec -it <container> bash  # Enter container shell
```

## Environment Variables

Create `.env` file in root directory with required variables.
See `docs/SETUP.md` for complete list.