#!/bin/bash

# Build api-server and its dependencies

echo "Building api-server and dependencies..."

# Clean previous builds
rm -rf dist
rm -rf packages/api-server/dist
rm -rf libs/shared/dist
rm -rf libs/database/dist

# Build libraries first
echo "Building shared library..."
yarn nx run shared:build

echo "Building database library..."
yarn nx run database:build

echo "Building api-server..."
yarn nx run api-server:build

# Create dist directory structure for Docker
mkdir -p dist/packages/api-server
mkdir -p dist/libs/shared
mkdir -p dist/libs/database

# Copy built files
cp -r packages/api-server/dist/* dist/packages/api-server/ 2>/dev/null || true
cp -r libs/shared/dist/* dist/libs/shared/ 2>/dev/null || true
cp -r libs/database/dist/* dist/libs/database/ 2>/dev/null || true

echo "Build complete!"