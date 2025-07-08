# GitHub Actions Workflows

This directory contains GitHub Actions workflows for CI/CD using Nx cache optimization.

## Overview

These workflows leverage Nx's intelligent caching system to:

- **Detect only changed projects** using `nx affected` commands
- **Build and push only modified containers** to ECR
- **Optimize build times** through multi-layer caching
- **Support parallel processing** for multiple projects

## File Structure

- `nightly.yml` - Nightly build and ECR push (currently disabled)
- `production.yml` - Production release build and ECR push (currently disabled)

## Features

### 🚀 Nx Cache Optimization

- **Affected Projects Detection**: Only builds projects that have changed
- **Dependency Graph Analysis**: Automatically handles project dependencies
- **Cache Restoration**: Restores previous build artifacts for faster builds

### 🐳 Docker Layer Caching

- **GitHub Actions Cache**: Local build cache for faster subsequent builds
- **ECR Registry Cache**: Remote cache stored in ECR for cross-runner sharing
- **Multi-platform Support**: Builds for both `linux/amd64` and `linux/arm64`

### 🔄 Parallel Processing

- **Matrix Strategy**: Builds multiple projects simultaneously
- **Fail-fast Control**: Continues building other projects if one fails
- **Resource Optimization**: Efficient use of GitHub Actions runners

## Workflow Details

### Nightly Workflow (`nightly.yml`)

- **Trigger**: Push to main branch (currently disabled)
- **Tags**: `nightly`, `{project}-nightly`
- **Process**:
  1. Detect affected projects using Nx
  2. Run tests for changed projects
  3. Build Docker images in parallel
  4. Push to ECR with nightly tags

### Production Workflow (`production.yml`)

- **Trigger**: GitHub Release publish (currently disabled)
- **Tags**: `production`, `{version}`, `{project}-production`
- **Process**:
  1. Detect affected projects using Nx
  2. Run tests for changed projects
  3. Build Docker images in parallel
  4. Push to ECR with production and version tags

## Setup Instructions

### 1. GitHub Secrets Configuration

Set the following secrets in your GitHub repository:

```bash
ECR_REGISTRY=123456789012.dkr.ecr.ap-northeast-2.amazonaws.com
ECR_REPOSITORY=your-repo-name
```

### 2. AWS IAM Role Configuration

Create an IAM role with ECR push permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    }
  ]
}
```

### 3. Enable Workflows

#### Enable Nightly Workflow

In `nightly.yml` file:

1. Uncomment the `on` section:
   ```yaml
   on:
     push:
       branches:
         - main
   ```
2. Remove the `if: false` condition from `affected-analysis` job

#### Enable Production Workflow

In `production.yml` file:

1. Uncomment the `on` section:
   ```yaml
   on:
     release:
       types: [published]
   ```
2. Remove the `if: false` condition from `affected-analysis` job

## Usage Examples

### Single Project Change

```bash
# When only helloworld project is changed
git commit -m "Update helloworld app"
git push origin main

# Result: Only helloworld container is built
```

### Multiple Project Changes

```bash
# When multiple projects are changed
git commit -m "Update multiple apps"
git push origin main

# Result: All changed projects are built in parallel
```

### Production Release

```bash
# Create a GitHub Release
# Result: Production images with version tags are built
```

## Caching Strategy

### 1. Nx Cache

- **Location**: `.nx/cache` directory
- **Key**: `nx-cache-{os}-{yarn.lock-hash}`
- **Benefit**: Reduces build time by reusing previous build artifacts

### 2. Docker Layer Cache

- **GitHub Actions**: `type=gha` for local caching
- **ECR Registry**: `type=registry` for cross-runner sharing
- **Benefit**: Faster Docker builds through layer reuse

### 3. Yarn Cache

- **Location**: `node_modules`
- **Key**: Automatic through `actions/setup-node@v4`
- **Benefit**: Faster dependency installation

## Optimization Tips

### 1. Dockerfile Optimization

```dockerfile
# Separate dependency layers
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .
```

### 2. Nx Configuration

```json
{
  "targetDefaults": {
    "build": {
      "cache": true,
      "dependsOn": ["^build"]
    }
  }
}
```

### 3. Parallel Processing

```yaml
strategy:
  matrix:
    project: ${{ fromJson(needs.affected.outputs.affected-projects) }}
  fail-fast: false
```

## Troubleshooting

### 1. Cache Issues

```bash
# Clear Nx cache
npx nx reset

# Clear Docker cache
docker builder prune
```

### 2. Build Failures

- Check workflow logs for specific error messages
- Verify dependency issues in `yarn.lock`
- Ensure Docker layer cache is not corrupted

### 3. Permission Issues

- Verify AWS IAM role permissions
- Check ECR registry access
- Ensure GitHub Secrets are properly configured

## Monitoring

### 1. Build Time Tracking

Monitor workflow execution time to verify optimization effects.

### 2. Cache Hit Rate

Track Nx cache and Docker cache hit rates for performance analysis.

### 3. Resource Usage

Monitor CPU and memory usage to adjust parallel processing settings.

## Important Notes

- All workflows are currently **disabled** for safety
- Configure AWS permissions and GitHub Secrets before activation
- For production environments, use stricter permission settings
- Monitor cache hit rates to ensure optimal performance
- Consider implementing security scanning for production images

## Support

For issues or questions:

1. Check workflow logs in GitHub Actions
2. Verify Nx cache and Docker cache functionality
3. Review AWS IAM permissions and ECR access
4. Test with a small change to verify affected project detection
