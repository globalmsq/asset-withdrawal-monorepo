# Cleanup Report - Asset Withdrawal Monorepo

## Summary

Analyzed 148 TypeScript/JavaScript files for cleanup opportunities.

## Issues Found

### 1. Console Statements (High Priority)

Found console.log/error/warn statements that should be replaced with proper logging:

- `docker/hardhat/` - 19+ console statements in test and deploy scripts
- `apps/tx-broadcaster/src/services/broadcaster.ts` - 1 console.error statement

**Recommendation**: Replace with LoggerService or appropriate logging framework

### 2. TODO Comments (Medium Priority)

Found 2 TODO comments indicating incomplete implementations:

- `apps/tx-broadcaster/src/worker/sqs-worker.ts` - Monitoring system integration pending

**Recommendation**: Create tasks to implement monitoring or remove if not needed

### 3. Environment Files (High Priority - Security)

Found 4 .env files that should not be in version control:

- `./docker/.env.development`
- `./apps/api-server/.env`
- `./apps/signing-service/.env`
- `./apps/tx-broadcaster/.env`

**Recommendation**: Add to .gitignore and remove from repository

### 4. Log Files (Low Priority)

Found log files that should be cleaned:

- `./logs/audit.log`
- `./.nx/workspace-data/d/daemon-error.log`
- `./.nx/workspace-data/d/daemon.log`
- `./apps/signing-service/logs/audit.log`

**Recommendation**: Add to .gitignore

### 5. Potential Unused Dependencies

- `apps/tx-broadcaster` - "database" dependency might be unused

**Recommendation**: Review and remove if not needed

## Cleanup Actions

### Safe Cleanup (Recommended)

1. Add .env files to .gitignore
2. Replace console statements with proper logging
3. Add log files to .gitignore
4. Review and implement TODOs

### Aggressive Cleanup (Use with Caution)

1. Remove all .env files from repository
2. Remove all log files
3. Remove unused dependencies
4. Remove commented-out code blocks

## Implementation Plan

### Phase 1: Security & Git Hygiene

- Update .gitignore
- Remove sensitive files from tracking
- Clean up log files

### Phase 2: Code Quality

- Replace console statements
- Address TODO comments
- Remove dead code

### Phase 3: Dependencies

- Audit and remove unused dependencies
- Update outdated packages

## Command Suggestions

```bash
# Add to .gitignore
echo "*.env" >> .gitignore
echo "*.log" >> .gitignore
echo ".DS_Store" >> .gitignore

# Remove from git tracking (but keep locally)
git rm --cached apps/*/.env
git rm --cached docker/.env.development
git rm --cached **/*.log

# Clean log files
find . -name "*.log" -type f -delete

# Check for unused dependencies
npx depcheck
```
