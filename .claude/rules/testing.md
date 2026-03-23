---
paths:
  - tests/**
  - __tests__/**
  - "**/*.test.*"
  - "**/*.spec.*"
---

# Testing Rules

- No test framework is currently configured — when adding one, prefer Vitest (aligns with the Vite-compatible ecosystem)
- Place unit tests adjacent to source: `foo.ts` → `foo.test.ts`
- Place integration/API tests in a top-level `tests/` directory
- Use descriptive test names that read as sentences
- Mock external services (MiniMax API, filesystem/vault access); never make real API calls in tests
- Do not mock the SQLite database — use an in-memory `:memory:` database for test isolation
- Run the full test suite before considering work complete
