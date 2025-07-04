# Docker Configuration

## Development Setup

To run MySQL database for local development:

```bash
# Start MySQL only
docker compose -f docker-compose.dev.yaml up -d

# Stop MySQL
docker compose -f docker-compose.dev.yaml down

# View logs
docker compose -f docker-compose.dev.yaml logs -f mysql
```

Then run the API server locally:

```bash
# In the project root
yarn nx serve api-server
```

## Production Setup

To build and run all services:

```bash
# Build and start all services
docker compose up --build -d

# Stop all services
docker compose down

# View logs
docker compose logs -f
```

## Troubleshooting

If you encounter build errors:

1. Make sure all dependencies are installed:
   ```bash
   yarn install
   ```

2. Build the project locally first:
   ```bash
   yarn nx run api-server:build
   ```

3. For development, use the dev compose file to run only MySQL:
   ```bash
   docker compose -f docker-compose.dev.yaml up -d
   ```