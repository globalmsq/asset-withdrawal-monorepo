# Blockchain Withdrawal System Monorepo

A TypeScript-based blockchain withdrawal system monorepo.

## 📁 Project Structure

```
├── apps/                  # Applications
│   └── api-server/        # API server application
├── packages/              # Shared libraries
│   └── shared/            # Common library
├── docker/                # Docker configuration
├── docs/                  # Documentation
├── nx.json               # Nx configuration
├── package.json          # Root package configuration
├── tsconfig.json         # TypeScript configuration
└── README.md            # This file
```

## 🚀 Getting Started

### 1. Install Dependencies
```bash
yarn install
```

### 2. Environment Configuration

Environment variables are configured at the application level. Copy the `env.example` file to `.env` in the API server directory:

```bash
# API Server
cp apps/api-server/env.example apps/api-server/.env
```

**Environment Variables:**

- **API Server** (`apps/api-server/.env`):
  - `NODE_ENV`: Development or production mode
  - `PORT`: API server port (default: 8080)
  - `MYSQL_HOST`: Database host
  - `MYSQL_PORT`: Database port
  - `MYSQL_USER`: Database user
  - `MYSQL_PASSWORD`: Database password
  - `MYSQL_DATABASE`: Database name

**Note:** Libraries do not have their own environment files. All configuration is injected from the application level.

### 3. Create New Package
```bash
# Create library
yarn nx g @nx/js:library my-package --directory=packages/my-package

# Create application
yarn nx g @nx/js:application my-app --directory=apps/my-app
```

### 4. Run Development Server
```bash
# Run all apps
yarn dev

# Run specific app (with auto-reload)
yarn nx serve helloworld

# Run with custom port
yarn nx serve helloworld --port=3001

# Run with environment variables
yarn nx serve helloworld --env NODE_ENV=development
```

**Features:**
- 🔄 **Auto-reload**: Server automatically restarts when code changes
- 🚀 **Fast build**: Uses esbuild for quick compilation
- 🔧 **Development mode**: Source maps enabled for debugging
- 📡 **HTTP server**: Runs on http://localhost:3000 by default

## 📋 Available Commands

```bash
# Build
yarn build                # Build all projects
yarn nx build my-package       # Build specific package

# Test
yarn test                 # Run all tests
yarn nx test my-package        # Test specific package
yarn coverage             # Run tests with coverage

# Linting
yarn lint                 # Lint all projects
yarn lint:fix            # Auto-fix linting issues

# Formatting
yarn format              # Format code with Prettier

# Dependency check
yarn depcheck            # Check for unused dependencies

# Clean
yarn clean               # Clean build artifacts and cache
```

## 🏗️ Architecture

### Package Structure
- **`apps/`**: Applications
  - Each package can be built and tested independently
  - Example: `helloworld` application
- **`packages/`**: Reusable libraries
  - Each library can be built and tested independently
  - Module references through TypeScript path mapping (`@packages/*`)

### Development Tools
- **Docker**: Containerization support in `docker/` directory
- **Documentation**: Project docs in `docs/` directory

## 🔧 Development Guide

### Adding New Package
1. Create package using `nx g @nx/js:library` command
2. Automatically added to paths in `tsconfig.base.json`
3. Importable from other packages using `@packages/my-package`

### Development Workflow
- **Hot reload**: `yarn nx serve helloworld` - Auto-restart on code changes
- **Build**: `yarn nx build helloworld` - Production build
- **Test**: `yarn nx test helloworld` - Run tests
- **Lint**: `yarn nx lint helloworld` - Check code quality

### Code Style
- Code style enforcement using ESLint + Prettier
- Automatic linting and formatting before commit (husky + lint-staged)
- TypeScript strict mode enabled

### Testing
- Unit testing using Jest
- Independent test execution for each package
- Code coverage report generation with `yarn coverage`

## 🛠️ Tools and Technologies

- **Nx**: Monorepo management and build system
- **TypeScript**: Type safety
- **Jest**: Testing framework with coverage support
- **ESLint**: Code quality inspection
- **Prettier**: Code formatting
- **Husky**: Git hooks for pre-commit checks
- **Yarn**: Package manager with workspaces
- **Docker**: Containerization support

## 📝 Conventions

### Package Naming
- Use kebab-case
- Clear and descriptive names

### Branch Naming
- `feature/feature-name`
- `fix/bug-name`
- `refactor/refactoring-name`

### Commit Messages
- Follow [Conventional Commits](https://www.conventionalcommits.org/) rules
- Use `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:` etc.