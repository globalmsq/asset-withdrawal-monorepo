# Task Master AI Setup Guide

This guide explains how to set up Task Master AI for enhanced project management and development workflow automation.

## Overview

Task Master AI is a powerful task management system that integrates with AI models to provide intelligent project planning, task breakdown, and progress tracking. This guide shows how to set it up for the Asset Withdrawal System project.

## Prerequisites

### Required API Keys

At least **one** of these API keys must be configured:

- `ANTHROPIC_API_KEY` (Claude models) - **Recommended**
- `PERPLEXITY_API_KEY` (Research features) - **Highly recommended**
- `OPENAI_API_KEY` (GPT models)
- `GOOGLE_API_KEY` (Gemini models)
- `MISTRAL_API_KEY` (Mistral models)
- `OPENROUTER_API_KEY` (Multiple models)
- `XAI_API_KEY` (Grok models)

### Environment Setup

Add your API keys to `.env`:
```bash
ANTHROPIC_API_KEY=your_anthropic_key_here
PERPLEXITY_API_KEY=your_perplexity_key_here
# Add other keys as needed
```

## Installation and Setup

### 1. Initialize Task Master

```bash
# Install Task Master AI globally
npm install -g task-master-ai

# Initialize in your project
task-master init

# Configure AI models interactively
task-master models --setup
```

### 2. Project Structure

Task Master creates the following structure:
```
.taskmaster/
├── tasks/
│   ├── tasks.json          # Main task database
│   └── task-*.md          # Individual task files
├── docs/
│   └── prd.txt            # Product requirements
├── reports/
│   └── task-complexity-report.json
├── templates/
│   └── example_prd.txt
└── config.json            # AI models & settings
```

## Essential Commands

### Project Setup Commands

```bash
# Generate tasks from PRD document
task-master parse-prd .taskmaster/docs/prd.txt

# Analyze task complexity with AI research
task-master analyze-complexity --research

# Expand all tasks into subtasks
task-master expand --all --research
```

### Daily Development Workflow

```bash
# Show all tasks with status
task-master list

# Get next available task to work on
task-master next

# View detailed task information
task-master show <id>

# Update task with implementation notes
task-master update-subtask --id=<id> --prompt="implementation details..."

# Mark task as complete
task-master set-status --id=<id> --status=done
```

### Task Management

```bash
# Add new task with AI assistance
task-master add-task --prompt="description" --research

# Break task into subtasks
task-master expand --id=<id> --research --force

# Update specific task
task-master update-task --id=<id> --prompt="changes"

# Update multiple tasks from ID onwards
task-master update --from=<id> --prompt="changes"
```

### Dependencies & Organization

```bash
# Add task dependency
task-master add-dependency --id=<id> --depends-on=<id>

# Reorganize task hierarchy
task-master move --from=<id> --to=<id>

# Check for dependency issues
task-master validate-dependencies

# Update task markdown files
task-master generate
```

## Task Structure

### Task ID Format
- Main tasks: `1`, `2`, `3`, etc.
- Subtasks: `1.1`, `1.2`, `2.1`, etc.
- Sub-subtasks: `1.1.1`, `1.1.2`, etc.

### Status Values
- `pending` - Ready to work on
- `in-progress` - Currently being worked on
- `done` - Completed and verified
- `deferred` - Postponed
- `cancelled` - No longer needed
- `blocked` - Waiting on external factors

### Task Example
```json
{
  "id": "1.2",
  "title": "Implement user authentication",
  "description": "Set up JWT-based auth system",
  "status": "pending",
  "priority": "high",
  "dependencies": ["1.1"],
  "details": "Use bcrypt for hashing, JWT for tokens...",
  "testStrategy": "Unit tests for auth functions, integration tests for login flow",
  "subtasks": []
}
```

## Integration with Development Tools

### Git Integration

```bash
# Create feature branch with task reference
git checkout -b BFS-32_feature-description

# Commit with task reference
git commit -m "[BFS-32] feat: implement feature (task 1.2)"

# Create PR with task reference
gh pr create --title "[BFS-32] Complete task 1.2: Feature name"
```

### Jira Integration

Task Master supports Jira synchronization:
- Store Jira keys in task metadata
- Sync status between Task Master and Jira
- Maintain bilingual workflow (Korean development, English Jira)

### MCP Integration

For Claude Code users, configure MCP in `.mcp.json`:
```json
{
  "mcpServers": {
    "task-master-ai": {
      "command": "npx",
      "args": ["-y", "--package=task-master-ai", "task-master-ai"],
      "env": {
        "ANTHROPIC_API_KEY": "your_key_here",
        "PERPLEXITY_API_KEY": "your_key_here"
      }
    }
  }
}
```

## Best Practices

### Project Requirements Document (PRD)

Create a comprehensive PRD in `.taskmaster/docs/prd.txt`:
```markdown
# Asset Withdrawal System Enhancement

## Overview
Brief description of the project goals and scope.

## Requirements
- Functional requirements
- Non-functional requirements
- Technical constraints

## Implementation Strategy
- Architecture decisions
- Technology choices
- Timeline considerations
```

### Task Breakdown Strategy

1. **Start with high-level tasks** from PRD parsing
2. **Use complexity analysis** to identify tasks needing breakdown
3. **Expand tasks iteratively** based on implementation discoveries
4. **Maintain dependencies** between related tasks
5. **Update progress regularly** with implementation notes

### Development Workflow

1. **Morning routine**:
   ```bash
   task-master next                    # Get next task
   task-master show <id>              # Review requirements
   ```

2. **During implementation**:
   ```bash
   task-master update-subtask --id=<id> --prompt="progress notes"
   ```

3. **Task completion**:
   ```bash
   task-master set-status --id=<id> --status=done
   task-master next                    # Get next task
   ```

## Configuration Examples

### Model Configuration
```bash
# Set specific models for different roles
task-master models --set-main claude-3-5-sonnet-20241022
task-master models --set-research perplexity-llama-3.1-sonar-large-128k-online
task-master models --set-fallback gpt-4o-mini
```

### Research Mode
Use `--research` flag for AI-enhanced operations:
```bash
task-master add-task --prompt="implement OAuth2" --research
task-master expand --id=5 --research --force
task-master analyze-complexity --research
```

## Troubleshooting

### Common Issues

**API Commands Failing**
```bash
# Check API keys
cat .env

# Verify model configuration
task-master models

# Test with different model
task-master models --set-fallback gpt-4o-mini
```

**Task File Sync Issues**
```bash
# Regenerate task files from tasks.json
task-master generate

# Fix dependency issues
task-master fix-dependencies
```

### Performance Tips

- Use `--research` flag for complex technical tasks
- Batch similar operations together
- Regular dependency validation prevents issues
- Keep PRDs updated for accurate task generation

## Advanced Features

### Multi-Project Management
```bash
# Switch between projects
task-master switch-project project-name

# List all projects
task-master list-projects
```

### Reporting and Analytics
```bash
# Generate complexity report
task-master complexity-report

# Export task data
task-master export --format=json
```

### Custom Templates
Create custom PRD templates in `.taskmaster/templates/`:
```markdown
# Custom Template
## Project: {{project_name}}
## Sprint: {{sprint_number}}
## Goals: {{sprint_goals}}
```

---

*This setup guide provides a foundation for AI-assisted project management while maintaining flexibility for different development workflows.*