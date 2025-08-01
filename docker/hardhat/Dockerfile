FROM node:18-alpine

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    wget \
    curl

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy hardhat config and contracts
COPY hardhat.config.js ./
COPY contracts ./contracts
COPY scripts ./scripts

# Compile contracts (if any exist)
RUN npx hardhat compile || true

# Expose Hardhat node port
EXPOSE 8545

# Run Hardhat node
CMD ["npm", "run", "node"]