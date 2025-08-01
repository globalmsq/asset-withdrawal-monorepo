# Asset Withdrawal System Sub-Agents

This directory contains specialized AI sub-agents designed to assist with various aspects of the Asset Withdrawal System development and maintenance.

## Available Agents

### 1. Code Analysis Agent
- **Purpose**: Deep code analysis and architecture review
- **File**: `code-analysis-agent.md`
- **Use Case**: When analyzing code quality, finding duplications, or reviewing architecture patterns

### 2. Test Coverage Agent
- **Purpose**: Comprehensive testing and quality assurance
- **File**: `test-coverage-agent.md`
- **Use Case**: When creating tests, analyzing coverage, or designing test strategies

### 3. Multi-Chain Specialist Agent
- **Purpose**: Blockchain integration and multi-chain support
- **File**: `multi-chain-specialist-agent.md`
- **Use Case**: When adding new chains, optimizing gas settings, or handling chain-specific features

### 4. Queue System Agent
- **Purpose**: AWS SQS and message queue optimization
- **File**: `queue-system-agent.md`
- **Use Case**: When optimizing queue performance, implementing retry strategies, or monitoring queues

### 5. Security Audit Agent
- **Purpose**: Security vulnerability identification and mitigation
- **File**: `security-audit-agent.md`
- **Use Case**: When auditing security, reviewing authentication, or analyzing encryption

### 6. Database Optimization Agent
- **Purpose**: Database performance and query optimization
- **File**: `database-optimization-agent.md`
- **Use Case**: When optimizing queries, designing indexes, or planning migrations

### 7. API Documentation Agent
- **Purpose**: API documentation and specification management
- **File**: `api-documentation-agent.md`
- **Use Case**: When generating API docs, creating examples, or updating specifications

### 8. Monitoring Setup Agent
- **Purpose**: Observability and monitoring implementation
- **File**: `monitoring-setup-agent.md`
- **Use Case**: When setting up monitoring, creating dashboards, or implementing alerts

## Usage

To use a specific agent, you can:

1. Load the agent context: `@.claude/agents/<agent-name>.md`
2. Use agent-specific commands listed in each agent file
3. Combine multiple agents for complex tasks

## Example Workflows

### Security Review
```bash
# Load security agent
@.claude/agents/security-audit-agent.md

# Run comprehensive audit
/security-audit --comprehensive
```

### Performance Optimization
```bash
# Load multiple agents
@.claude/agents/code-analysis-agent.md
@.claude/agents/database-optimization-agent.md
@.claude/agents/monitoring-setup-agent.md

# Analyze performance bottlenecks
/analyze-performance --focus=database
/analyze-queries --slow-threshold=100
/create-metrics --service=signing-service
```

### Multi-Chain Integration
```bash
# Load chain specialist
@.claude/agents/multi-chain-specialist-agent.md

# Add new blockchain
/add-chain --chain=avalanche --network=mainnet
/optimize-gas --chain=avalanche --analysis
```
