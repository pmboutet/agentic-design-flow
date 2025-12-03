# Claude Code Instructions

## Development Workflow

### Before Each Commit
1. **Run all unit tests**: `npm test`
2. **Verify build**: `npm run build`
3. Only commit if both pass

### Feature Development Guidelines

When developing new features or modifying existing code:

1. **Update or create unit tests** for any changed functionality
2. **Maintain test coverage** - every new function/module should have corresponding tests
3. **Run tests frequently** during development to catch issues early

### Test Structure

- Tests are located in `__tests__` directories alongside the code they test
- Use Jest with TypeScript (`ts-jest`)
- React hooks tests require `@jest-environment jsdom` directive

### Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests for specific file
npm test -- --testPathPattern="filename"

# Run build
npm run build
```

### Code Quality

- Fix all TypeScript errors before committing
- Ensure no security vulnerabilities (keep dependencies updated)
- Follow existing code patterns and conventions
