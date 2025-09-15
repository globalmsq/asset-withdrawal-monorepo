# Development Tools Integration Guide

This document explains how to integrate AI assistants and development tools with the Asset Withdrawal System for enhanced productivity.

## Overview

The Asset Withdrawal System is designed to work seamlessly with various AI-powered development tools. While the repository excludes personal AI configurations (via `.gitignore`), contributors can set up their own development environment with similar tools.

## Supported AI Assistant Integrations

### Task Management AI
The project structure supports task management AI tools that can:
- Parse product requirements documents (PRD)
- Generate structured task breakdowns
- Track implementation progress
- Manage dependencies between tasks
- Provide complexity analysis

**Setup Example:**
```bash
# Initialize task management
npm install -g task-master-ai
task-master init
task-master parse-prd docs/your-prd.txt
```

### Code Analysis AI
Integration with semantic code analysis tools for:
- Symbol-based navigation
- Codebase understanding
- Memory persistence across sessions
- Multi-language project support

**Features:**
- TypeScript/JavaScript semantic analysis
- Project memory for context retention
- Cross-file dependency tracking
- Intelligent code completion

### Claude Code Integration
For Claude Code users, the project includes:
- Tool allowlist configurations
- Custom slash commands for common workflows
- Git integration patterns
- Quality check automation

## Development Workflow Tools

### Git Integration
The project supports AI-assisted git workflows:
```bash
# Example workflow patterns
git checkout -b [JIRA-KEY]_feature-description
# ... make changes ...
git commit -m "[JIRA-KEY] feat: description"
gh pr create --title "[JIRA-KEY] Feature name"
```

### Quality Automation
Recommended quality check automation:
```bash
# Pre-commit quality checks
pnpm run lint
pnpm run typecheck
pnpm run format
pnpm run depcheck
```

### Jira Integration
The project includes patterns for:
- Automatic Jira issue creation
- Status synchronization
- Epic linkage management
- Bilingual task management (Korean development, English Jira)

## Setting Up Your Environment

### 1. AI Tool Configuration
Create your own AI tool configurations in:
- `.your-ai-tool/` directories (add to your local `.gitignore`)
- Personal configuration files
- Custom command sets

### 2. Environment Variables
Required for AI integrations:
```bash
# Example .env setup
ANTHROPIC_API_KEY=your_key_here
PERPLEXITY_API_KEY=your_key_here
# ... other API keys as needed
```

### 3. MCP Server Setup
For MCP-compatible tools, configure in `.mcp.json`:
```json
{
  "mcpServers": {
    "your-ai-tool": {
      "command": "your-tool-command",
      "args": ["--config", "your-config"],
      "env": {
        "API_KEY": "your_key"
      }
    }
  }
}
```

## Best Practices

### Documentation
- Keep AI-generated documentation in English
- Use Korean for internal task management if preferred
- Maintain clear separation between personal and project documentation

### Security
- Never commit API keys or personal identifiers
- Use `.env.example` files for configuration templates
- Keep personal AI configurations in gitignored directories

### Collaboration
- Document AI-assisted changes clearly in commit messages
- Include manual review for AI-generated code
- Maintain human oversight for critical decisions

## Tool Recommendations

### For TypeScript Development
- **Semantic Analysis**: Tools that understand TypeScript symbols and dependencies
- **Code Generation**: AI assistants with strong TypeScript/Node.js knowledge
- **Testing**: Automated test generation and coverage analysis

### For Blockchain Development
- **Multi-chain Support**: Tools familiar with Ethereum, Polygon, BSC networks
- **Smart Contract Integration**: Understanding of ethers.js and Web3 patterns
- **Security Analysis**: Blockchain-specific security pattern recognition

### For Microservices Architecture
- **Service Communication**: Understanding of queue-based architectures
- **Docker Integration**: Container and compose file management
- **Database Operations**: Prisma ORM and migration management

## Contributing with AI Tools

When contributing to the project:

1. **Use AI for efficiency, not replacement of human judgment**
2. **Document AI assistance in commit messages when relevant**
3. **Ensure all AI-generated code passes quality checks**
4. **Maintain coding standards regardless of generation method**
5. **Review AI suggestions for security and performance implications**

## Troubleshooting

### Common Issues
- **API Rate Limits**: Configure appropriate rate limiting for AI tools
- **Context Management**: Use session persistence features for large codebases
- **Tool Conflicts**: Ensure different AI tools don't interfere with each other

### Getting Help
- Check individual tool documentation for specific setup instructions
- Refer to project's `.claude/`, `.taskmaster/`, or similar directories for examples (if you have access)
- Use the project's existing development patterns as templates

## Future Enhancements

The project structure is designed to evolve with AI tooling advancements:
- Enhanced semantic understanding
- Better cross-language support
- Improved automation workflows
- Advanced testing integration

---

*This guide provides a framework for AI-assisted development while maintaining project quality and security standards.*