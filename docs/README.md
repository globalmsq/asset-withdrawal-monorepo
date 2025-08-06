# Documentation Index

Welcome to the Asset Withdrawal System documentation. This directory contains comprehensive technical documentation for the system.

## 📚 Core Documentation

### [Architecture Overview](./ARCHITECTURE.md)
Complete system architecture including:
- Service architecture and responsibilities
- Data flow diagrams
- Queue system design
- DLQ error handling strategies
- Security architecture
- Scaling strategies

### [Technical Design](./TECHNICAL_DESIGN.md)
Detailed technical specifications:
- Technology stack
- Database schema design
- API specifications
- Environment variables
- Batch processing architecture
- Performance optimization strategies

### [Setup Guide](./SETUP.md)
Complete setup and installation guide:
- Prerequisites and requirements
- Environment configuration
- Docker setup
- Database initialization
- Development workflow
- Troubleshooting

### [Transaction Lifecycle](./TRANSACTION_LIFECYCLE.md)
Comprehensive transaction flow documentation:
- Transaction states and transitions
- Processing flow diagrams
- Error handling and recovery
- Queue message formats
- DLQ recovery strategies
- Monitoring and metrics

## 🔧 Development Guides

### [Hardhat Development](./hardhat-development.md)
Local blockchain development guide:
- Hardhat node configuration
- Mock token deployment
- Testing with local blockchain
- Integration with services

### [API Documentation](./api/README.md)
REST API reference:
- Authentication endpoints
- Withdrawal operations
- Status queries
- Admin operations
- Error responses

## 📂 Additional Resources

### API Subdirectories
- [`api/endpoints/`](./api/endpoints/) - Detailed endpoint documentation
- [`api/examples/`](./api/examples/) - Request/response examples
- [`api/guides/`](./api/guides/) - API usage guides

## 🗺️ Navigation Guide

### For New Developers
1. Start with [Setup Guide](./SETUP.md)
2. Review [Architecture Overview](./ARCHITECTURE.md)
3. Understand [Transaction Lifecycle](./TRANSACTION_LIFECYCLE.md)

### For API Integration
1. Read [API Documentation](./api/README.md)
2. Check [API Examples](./api/examples/)
3. Review authentication in [API Guides](./api/guides/)

### For System Design
1. Study [Technical Design](./TECHNICAL_DESIGN.md)
2. Review [Architecture Overview](./ARCHITECTURE.md)
3. Understand queue system in [Transaction Lifecycle](./TRANSACTION_LIFECYCLE.md)

### For Testing
1. Setup local environment with [Setup Guide](./SETUP.md)
2. Use [Hardhat Development](./hardhat-development.md) for blockchain testing
3. Follow testing strategies in [Technical Design](./TECHNICAL_DESIGN.md)

## 📝 Documentation Standards

All documentation in this directory follows these standards:
- Written in English
- Uses Markdown formatting
- Includes code examples where relevant
- Maintains consistent terminology
- Updated with each major change

## 🔄 Keeping Documentation Updated

When making changes to the system:
1. Update relevant documentation files
2. Add new sections if introducing features
3. Update environment variables in SETUP.md
4. Document breaking changes
5. Keep diagrams current

## 📞 Support

For questions not covered in documentation:
- Check the main [README.md](../README.md)
- Review code comments in source files
- Consult team members
- Create documentation issues in project tracker