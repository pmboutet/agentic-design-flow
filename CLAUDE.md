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

## Clean Code Principles

### No Legacy Code

**NEVER keep legacy/deprecated code when a new feature replaces it.** When a new functionality replaces an old one:

1. **Remove the old code completely** - don't keep deprecated fields/functions/types "for backward compatibility"
2. **Create a data migration** if needed to convert existing data to the new format
3. **Update all references** across the codebase (types, API routes, components, tests)
4. **Update unit tests** to reflect the new behavior

Rationale: Legacy code accumulates technical debt, causes confusion, and leads to bugs when developers don't know which version to use.

### DRY - Don't Repeat Yourself

**ALWAYS check if similar functionality exists before implementing something new.**

1. **Search first** - Before writing new code, search the codebase for similar functions, utilities, or patterns
2. **Reuse existing code** - If something similar exists, extend or adapt it rather than creating a duplicate
3. **Refactor to factorize** - If you find duplicated logic, refactor it into a shared utility even if it takes more time
4. **Prefer quality over speed** - It's better to spend extra time maintaining a well-factorized codebase than to accumulate duplicated code

When implementing a new feature:
- Search for similar patterns: `grep -r "similar_keyword" src/`
- Check utility files: `src/lib/`, `src/utils/`, `src/hooks/`
- Look for existing components that could be extended
- If refactoring is needed to avoid duplication, do it

Rationale: Duplicated code leads to inconsistent behavior, harder maintenance, and bugs when one copy is fixed but not the others.

### Keep Code Simple and Readable

1. **Short files** - break large files into smaller, focused modules
2. **Single responsibility** - each function/module does one thing well
3. **Clear naming** - variable/function names should be self-documenting
4. **Minimal comments** - code should be clear enough without excessive comments
5. **No dead code** - remove unused functions, variables, and imports

### Unit Tests Are Mandatory

1. **Every new function/module must have tests**
2. **Tests should be maintained** - update tests when code changes
3. **Test edge cases** - null values, empty arrays, error conditions
4. **Run tests before committing** - never commit breaking tests

## Critical Architecture Notes

### Conversation Modes & Thread Handling

The ASK system supports three conversation modes defined by `conversation_mode`:

1. **`individual_parallel`**: Each participant gets their own thread (is_shared = false)
   - Separate conversation plans per participant
   - No cross-visibility between participants

2. **`collaborative`**: All participants share one thread (is_shared = true)
   - Single conversation plan shared by all
   - Everyone sees all messages

3. **`group_reporter`**: All participants share one thread with designated spokesperson

**IMPORTANT**: When modifying API routes that handle ASK sessions:
- Always include `conversation_mode` in SELECT queries for ask_sessions
- Always pass `conversation_mode` to `askConfig` when calling `getOrCreateConversationThread()`
- The `shouldUseSharedThread()` function in `src/lib/asks.ts` determines thread behavior
- Tests for this logic are in `src/lib/__tests__/asks.test.ts`
