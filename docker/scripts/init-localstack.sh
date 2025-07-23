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

# Create DLQ queues
awslocal sqs create-queue \
  --queue-name invalid-dlq \
  --region $REGION \
  --attributes MessageRetentionPeriod=1209600

awslocal sqs create-queue \
  --queue-name tx-dlq \
  --region $REGION \
  --attributes MessageRetentionPeriod=1209600

# Get queue ARNs
INVALID_DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/invalid-dlq \
  --region $REGION \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)

TX_DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/tx-dlq \
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
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${TX_DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"1000\\\"}\"}"

echo "SQS queues created successfully:"
echo "- tx-request-queue (DLQ: invalid-dlq)"
echo "- signed-tx-queue (DLQ: tx-dlq)"
echo "- invalid-dlq"
echo "- tx-dlq"

# Create test secrets in Secrets Manager (for development)
# Create polygon-wallet-key for backward compatibility
awslocal secretsmanager create-secret \
  --name polygon-wallet-key \
  --region $REGION \
  --secret-string '{"privateKey":"0x0000000000000000000000000000000000000000000000000000000000000001"}' \
  2>/dev/null || echo "Secret 'polygon-wallet-key' already exists"

# Create signing-service private key (matches SIGNING_SERVICE_PRIVATE_KEY_SECRET default value)
awslocal secretsmanager create-secret \
  --name signing-service/private-key \
  --region $REGION \
  --secret-string '0x0000000000000000000000000000000000000000000000000000000000000001' \
  2>/dev/null || echo "Secret 'signing-service/private-key' already exists"

echo "LocalStack initialization complete!"