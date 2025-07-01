# GitHub Actions Workflows

This directory contains GitHub Actions workflows for CI/CD.

## File Structure

- `nightly.yml` - Nightly build and ECR push (currently disabled)
- `production.yml` - Production release build and ECR push (currently disabled)

## Activation Instructions

### 1. Enable Nightly Workflow

In `nightly.yml` file:
1. Remove the `# on:` comment
2. Remove the `if: false` line or change to `if: true`
3. Configure GitHub Secrets:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `ECR_REPO` (e.g., `123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/your-repo`)

### 2. Enable Production Workflow

In `production.yml` file:
1. Remove the `# on:` comment
2. Remove the `if: false` line or change to `if: true`
3. Configure GitHub Secrets (same as nightly)

## Workflow Description

### Nightly Workflow
- **Trigger**: Push to main branch
- **Action**: Run tests → Build Docker → Push to ECR with `:nightly` tag

### Production Workflow
- **Trigger**: GitHub Release creation
- **Action**: Build Docker → Push to ECR with `:production` and `:v1.2.3` tags

## Required AWS Permissions

Minimum permissions required to push images to ECR:
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

## Important Notes

- All workflows are currently disabled
- Make sure to configure AWS permissions and GitHub Secrets before activation
- For production environments, stricter permission settings are recommended for security