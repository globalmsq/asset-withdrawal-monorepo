#!/bin/sh

echo "Waiting for Hardhat node to be ready..."

# Function to check if Hardhat node is ready
check_hardhat_ready() {
    wget --spider -q http://hardhat-node:8545 2>/dev/null
    return $?
}

# Wait for Hardhat node to be ready (max 30 seconds)
COUNTER=0
MAX_TRIES=30
while ! check_hardhat_ready; do
    COUNTER=$((COUNTER + 1))
    if [ $COUNTER -ge $MAX_TRIES ]; then
        echo "Error: Hardhat node failed to start after $MAX_TRIES seconds"
        exit 1
    fi
    echo "Waiting for Hardhat node... ($COUNTER/$MAX_TRIES)"
    sleep 1
done

echo "Hardhat node is ready!"

# Deploy contracts
echo "Deploying contracts to Hardhat node..."
cd /app

# Set the Hardhat node URL for Docker network
export HARDHAT_NODE_URL="http://hardhat-node:8545"

# Run the deployment script
npx hardhat run scripts/deploy.js --network localhost

# Check if deployment was successful
if [ $? -eq 0 ]; then
    echo "Contracts deployed successfully!"
    
    # Copy deployment info to shared volume if it exists
    if [ -f "deployment.json" ]; then
        echo "Deployment info saved to deployment.json"
        
        # If we have a mounted volume for deployment info, copy it there
        if [ -d "/deployment" ]; then
            cp deployment.json /deployment/
            echo "Deployment info copied to shared volume"
        fi
    fi
    
    echo "Hardhat initialization complete!"
    exit 0
else
    echo "Error: Contract deployment failed!"
    exit 1
fi