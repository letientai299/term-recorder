---
description: Use Bun as the dev toolchain, but keep library code runtime-agnostic.
globs: '*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json'
alwaysApply: false
---

Bun is the dev toolchain (runner, test, package manager). The library itself
must stay runtime-agnostic (Node.js, Deno, Bun).

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`

## Library Code (src/)

- Use `node:*` APIs (`node:fs`, `node:path`, `node:child_process`, etc.) — they
  work across Node.js, Deno, and Bun.
- Do NOT use Bun-specific APIs (`Bun.file`, `Bun.spawn`, `Bun.sleep`,
  `bun:sqlite`, `Bun.$`) in library code.
- Do NOT use Deno-specific APIs either.
- `setTimeout`/`setInterval` and Web APIs (fetch, crypto, ReadableStream) are
  fine — they're universal.

## Testing

Use `bun test` to run tests. Test files may use `bun:test` and Bun-specific
APIs since they don't ship to consumers.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```
