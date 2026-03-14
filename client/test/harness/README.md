# Direct Test Harness

This directory contains tests that run **without** VS Code. They exercise
pure logic, API calls, and utility functions by importing modules directly
and using Mocha + Chai + Sinon (the same stack the rest of the project uses).

## When to use this harness

- Testing code that does **not** import from `"vscode"` (stores, utilities,
  API helpers, data transformations).
- Verifying HTTP API interactions by mocking axios (e.g., StudioWeb adapters).
- Fast feedback: no VS Code download/launch overhead.

## Running

```bash
npm run test-harness
```

Or run a single file:

```bash
npx mocha -r ts-node/register client/test/harness/studioweb-state.test.ts
```
