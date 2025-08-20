#!/bin/bash

# Test script to verify SQS integration between tx-broadcaster and tx-monitor

echo "=== Testing SQS Integration between tx-broadcaster and tx-monitor ==="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if containers are running
echo "1. Checking if containers are running..."
if docker ps | grep -q withdrawal-tx-broadcaster && docker ps | grep -q withdrawal-tx-monitor; then
    echo -e "${GREEN}✓ Both tx-broadcaster and tx-monitor containers are running${NC}"
else
    echo -e "${RED}✗ One or both containers are not running${NC}"
    echo "Please start the containers with: docker-compose -f docker/docker-compose.yaml up -d"
    exit 1
fi

echo ""
echo "2. Checking SQS queue status..."
# Check if broadcast-tx-queue exists
QUEUE_URL="http://localhost:4566/_aws/sqs/ap-northeast-2/000000000000/broadcast-tx-queue"
QUEUE_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "$QUEUE_URL")

if [ "$QUEUE_CHECK" = "200" ]; then
    echo -e "${GREEN}✓ broadcast-tx-queue exists${NC}"
else
    echo -e "${YELLOW}⚠ broadcast-tx-queue might not exist or LocalStack is not accessible${NC}"
fi

echo ""
echo "3. Checking tx-broadcaster logs for SQS sending..."
RECENT_BROADCAST=$(docker logs withdrawal-tx-broadcaster --tail 50 2>&1 | grep -i "sending to broadcast-tx-queue\|broadcast-tx-queue")
if [ ! -z "$RECENT_BROADCAST" ]; then
    echo -e "${GREEN}✓ tx-broadcaster is sending messages to broadcast-tx-queue${NC}"
    echo "   Recent log entry:"
    echo "   $RECENT_BROADCAST" | head -1
else
    echo -e "${YELLOW}⚠ No recent broadcast-tx-queue activity in tx-broadcaster logs${NC}"
fi

echo ""
echo "4. Checking tx-monitor logs for SQS receiving..."
RECENT_RECEIVE=$(docker logs withdrawal-tx-monitor --tail 50 2>&1 | grep -i "SQSWorker\|broadcast-tx-queue")
if [ ! -z "$RECENT_RECEIVE" ]; then
    echo -e "${GREEN}✓ tx-monitor has SQS worker activity${NC}"
    echo "   Recent log entry:"
    echo "   $RECENT_RECEIVE" | head -1
else
    echo -e "${YELLOW}⚠ No recent SQS worker activity in tx-monitor logs${NC}"
fi

echo ""
echo "5. Checking for any errors..."
BROADCASTER_ERRORS=$(docker logs withdrawal-tx-broadcaster --tail 100 2>&1 | grep -i "error\|failed" | grep -v "no error")
MONITOR_ERRORS=$(docker logs withdrawal-tx-monitor --tail 100 2>&1 | grep -i "error\|failed" | grep -v "no error")

if [ -z "$BROADCASTER_ERRORS" ] && [ -z "$MONITOR_ERRORS" ]; then
    echo -e "${GREEN}✓ No recent errors found in either service${NC}"
else
    if [ ! -z "$BROADCASTER_ERRORS" ]; then
        echo -e "${RED}✗ Errors found in tx-broadcaster:${NC}"
        echo "$BROADCASTER_ERRORS" | head -3
    fi
    if [ ! -z "$MONITOR_ERRORS" ]; then
        echo -e "${RED}✗ Errors found in tx-monitor:${NC}"
        echo "$MONITOR_ERRORS" | head -3
    fi
fi

echo ""
echo "=== Test Summary ==="
echo "The SQS integration has been configured to:"
echo "1. tx-broadcaster sends messages to broadcast-tx-queue after broadcasting"
echo "2. tx-monitor receives messages from broadcast-tx-queue via SQS worker"
echo "3. tx-monitor adds received transactions to its monitoring system"
echo ""
echo "To verify end-to-end flow:"
echo "1. Submit a withdrawal request via API"
echo "2. Check tx-broadcaster logs for broadcasting"
echo "3. Check tx-monitor logs for SQS message receipt"
echo "4. Verify transaction monitoring starts"