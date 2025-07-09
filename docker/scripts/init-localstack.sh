#!/bin/bash
set -e

echo "Initializing LocalStack SQS queues..."

# Wait for LocalStack to be ready
until awslocal sqs list-queues 2>/dev/null; do
  echo "Waiting for LocalStack to be ready..."
  sleep 2
done

echo "LocalStack is ready, creating queues..."

# Create main queues
awslocal sqs create-queue \
  --queue-name tx-request-queue \
  --attributes MessageRetentionPeriod=1209600,VisibilityTimeout=300

awslocal sqs create-queue \
  --queue-name signed-tx-queue \
  --attributes MessageRetentionPeriod=1209600,VisibilityTimeout=300

# Create DLQ queues
awslocal sqs create-queue \
  --queue-name invalid-dlq \
  --attributes MessageRetentionPeriod=1209600

awslocal sqs create-queue \
  --queue-name tx-dlq \
  --attributes MessageRetentionPeriod=1209600

# Get queue ARNs
INVALID_DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/invalid-dlq \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)

TX_DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/tx-dlq \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)

# Update main queues with redrive policies
awslocal sqs set-queue-attributes \
  --queue-url http://localhost:4566/000000000000/tx-request-queue \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${INVALID_DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}"

awslocal sqs set-queue-attributes \
  --queue-url http://localhost:4566/000000000000/signed-tx-queue \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${TX_DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}"

echo "SQS queues created successfully:"
echo "- tx-request-queue (DLQ: invalid-dlq)"
echo "- signed-tx-queue (DLQ: tx-dlq)"
echo "- invalid-dlq"
echo "- tx-dlq"

# Create test secret in Secrets Manager (for development)
awslocal secretsmanager create-secret \
  --name polygon-wallet-key \
  --secret-string '{"privateKey":"0x0000000000000000000000000000000000000000000000000000000000000001"}' \
  2>/dev/null || echo "Secret already exists"

echo "LocalStack initialization complete!"