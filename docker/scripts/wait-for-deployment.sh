#!/bin/sh

# Script to wait for deployment completion
# Used as a healthcheck or wait script for services that depend on contract deployment

echo "Waiting for contract deployment..."

# Check if deployment file exists
check_deployment() {
    if [ -f "/deployment/deployment.json" ]; then
        echo "Deployment file found!"
        return 0
    else
        return 1
    fi
}

# Wait for deployment (max 60 seconds)
COUNTER=0
MAX_TRIES=60
while ! check_deployment; do
    COUNTER=$((COUNTER + 1))
    if [ $COUNTER -ge $MAX_TRIES ]; then
        echo "Error: Deployment file not found after $MAX_TRIES seconds"
        exit 1
    fi
    echo "Waiting for deployment... ($COUNTER/$MAX_TRIES)"
    sleep 1
done

echo "Deployment complete!"
exit 0