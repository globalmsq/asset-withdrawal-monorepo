#!/bin/bash
set -e

echo "Initializing LocalStack SQS queues..."

# Set region (default to ap-northeast-2)
REGION=${AWS_DEFAULT_REGION:-ap-northeast-2}
echo "Using region: $REGION"

# Wait for LocalStack to be ready
until awslocal sqs list-queues --region $REGION 2>/dev/null; do
  echo "Waiting for LocalStack to be ready..."
  sleep 2
done

echo "LocalStack is ready, creating queues..."

# Create main queues
awslocal sqs create-queue \
  --queue-name tx-request-queue \
  --region $REGION \
  --attributes MessageRetentionPeriod=1209600,VisibilityTimeout=30

awslocal sqs create-queue \
  --queue-name signed-tx-queue \
  --region $REGION \
  --attributes MessageRetentionPeriod=1209600,VisibilityTimeout=30

awslocal sqs create-queue \
  --queue-name broadcast-tx-queue \
  --region $REGION \
  --attributes MessageRetentionPeriod=1209600,VisibilityTimeout=30

# Create DLQ queues
awslocal sqs create-queue \
  --queue-name invalid-dlq \
  --region $REGION \
  --attributes MessageRetentionPeriod=1209600

awslocal sqs create-queue \
  --queue-name signed-tx-dlq \
  --region $REGION \
  --attributes MessageRetentionPeriod=1209600

awslocal sqs create-queue \
  --queue-name broadcast-dlq \
  --region $REGION \
  --attributes MessageRetentionPeriod=1209600

# Get queue ARNs
INVALID_DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/invalid-dlq \
  --region $REGION \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)

SIGNED_TX_DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/signed-tx-dlq \
  --region $REGION \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)

BROADCAST_DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/broadcast-dlq \
  --region $REGION \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)

# Update main queues with redrive policies
awslocal sqs set-queue-attributes \
  --queue-url http://localhost:4566/000000000000/tx-request-queue \
  --region $REGION \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${INVALID_DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"1000\\\"}\"}"

awslocal sqs set-queue-attributes \
  --queue-url http://localhost:4566/000000000000/signed-tx-queue \
  --region $REGION \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${SIGNED_TX_DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"1000\\\"}\"}"

awslocal sqs set-queue-attributes \
  --queue-url http://localhost:4566/000000000000/broadcast-tx-queue \
  --region $REGION \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${BROADCAST_DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"1000\\\"}\"}"

echo "SQS queues created successfully:"
echo "- tx-request-queue (DLQ: invalid-dlq)"
echo "- signed-tx-queue (DLQ: signed-tx-dlq)"
echo "- broadcast-tx-queue (DLQ: broadcast-dlq)"
echo "- invalid-dlq"
echo "- signed-tx-dlq"
echo "- broadcast-dlq"

# Create development secrets in Secrets Manager (using Hardhat's first account)
# Create signing-service private key (matches SIGNING_SERVICE_PRIVATE_KEY_SECRET default value)
awslocal secretsmanager create-secret \
  --name signing-service/private-key \
  --region $REGION \
  --secret-string '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' \
  2>/dev/null || echo "Secret 'signing-service/private-key' already exists"

echo "LocalStack initialization complete!"