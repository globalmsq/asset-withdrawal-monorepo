# Task Completion Checklist

## Before Starting a Task

1. **Get task details**: `npx task-master show <id>`
2. **Update status**: `npx task-master set-status --id=<id> --status=in-progress`
3. **Create branch**: `git checkout -b BFS-XX_feature-name`
4. **Sync to Jira**: Update Jira issue status to "IN PROGRESS"

## During Development

### Planning Phase
1. Thoroughly analyze the problem
2. Read relevant codebase files
3. Write detailed plan to `plan.md` with specific todo items
4. Check in with developer before implementation
5. Keep changes simple and minimal

### Implementation
1. Follow existing patterns in codebase
2. Use TypeScript strict mode - all types defined
3. Keep functions small and focused
4. Use async/await for async operations
5. Add implementation notes: `npx task-master update-subtask --id=<id> --prompt="notes"`

## After Code Changes (MANDATORY)

### Quality Checks - MUST RUN
```bash
pnpm run lint        # Check code style
pnpm run typecheck   # Check TypeScript types
pnpm run format      # Check code formatting
pnpm run depcheck    # Check for unused dependencies
```

Fix any issues before proceeding:
```bash
pnpm run lint:fix    # Auto-fix linting issues
pnpm run format:fix  # Auto-fix formatting
```

### Testing
- Create minimal test file for new features
- Only implement comprehensive tests when explicitly requested
- Do NOT run tests automatically unless asked

## Completing a Task

### Final Steps
1. **Review changes**: Ensure all requirements are met
2. **Update plan.md**: Add review section summarizing changes
3. **Document impacts**: List potential impacts or considerations
4. **Suggest follow-ups**: Note any follow-up tasks needed

### Git Workflow
1. **Stage files** (only when requested): `git add .`
2. **Commit with Jira key**: `git commit -m "[BFS-XX] type: description"`
   - Types: feat, fix, docs, style, refactor, test, chore
3. **Push branch**: `git push -u origin branch-name`
4. **Create PR**: 
   ```bash
   gh pr create --title "[BFS-XX] Feature name" \
                --body "Implementation details..."
   ```

### Task Management
1. **Update Task Master**: `npx task-master set-status --id=<id> --status=done`
2. **Sync to Jira**: Transition Jira issue to "DONE"
3. **Add completion notes**: Summary in Jira of what was implemented

## Important Rules

### NEVER Do These
- ❌ Commit changes automatically
- ❌ Run `git commit` without explicit user request
- ❌ Create Prisma migration files
- ❌ Write raw SQL queries
- ❌ Expose sensitive information in logs
- ❌ Use `any` type in TypeScript
- ❌ Skip the mandatory quality checks

### ALWAYS Do These
- ✅ Run lint and typecheck after code changes
- ✅ Use Prisma for all database operations
- ✅ Hash passwords before storing
- ✅ Validate user inputs with Zod schemas
- ✅ Follow existing code patterns
- ✅ Write code and comments in English
- ✅ Include Jira key in commit messages
- ✅ Wait for explicit commit instructions

## Error Recovery

If quality checks fail:
1. Review the error messages
2. Fix issues using auto-fix commands where available
3. Manually fix remaining issues
4. Re-run checks until all pass
5. Document any workarounds in code comments

## Communication

- Keep developer informed of progress
- Ask for clarification when requirements unclear
- Report blockers immediately
- Document decisions in plan.md