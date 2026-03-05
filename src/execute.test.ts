import { describe, expect, test } from "bun:test";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { patchCastHeader } from "./execute.ts";

function tmpFile(content: string): string {
  const path = join(tmpdir(), `test-cast-${Date.now()}-${Math.random()}.cast`);
  writeFileSync(path, content);
  return path;
}

function readHeader(path: string): Record<string, unknown> {
  const content = readFileSync(path, "utf-8");
  return JSON.parse(content.slice(0, content.indexOf("\n")));
}

describe("patchCastHeader", () => {
  test("patches asciicast v3 header (term.cols/rows)", () => {
    const header = { version: 3, term: { cols: 82, rows: 22 } };
    const body = '\n[0.1, "o", "hello"]\n';
    const path = tmpFile(JSON.stringify(header) + body);
    try {
      patchCastHeader(path, 80, 24);
      const patched = readHeader(path) as {
        term: { cols: number; rows: number };
      };
      expect(patched.term.cols).toBe(80);
      expect(patched.term.rows).toBe(24);
    } finally {
      unlinkSync(path);
    }
  });

  test("patches asciicast v2 header (width/height)", () => {
    const header = { version: 2, width: 82, height: 22 };
    const body = '\n[0.1, "o", "hello"]\n';
    const path = tmpFile(JSON.stringify(header) + body);
    try {
      patchCastHeader(path, 80, 24);
      const patched = readHeader(path) as { width: number; height: number };
      expect(patched.width).toBe(80);
      expect(patched.height).toBe(24);
    } finally {
      unlinkSync(path);
    }
  });

  test("preserves event data after header", () => {
    const header = { version: 3, term: { cols: 82, rows: 22 } };
    const events = '\n[0.1, "o", "hello"]\n[0.2, "o", "world"]\n';
    const path = tmpFile(JSON.stringify(header) + events);
    try {
      patchCastHeader(path, 80, 24);
      const content = readFileSync(path, "utf-8");
      const lines = content.split("\n");
      expect(lines[1]).toBe('[0.1, "o", "hello"]');
      expect(lines[2]).toBe('[0.2, "o", "world"]');
    } finally {
      unlinkSync(path);
    }
  });

  test("no-op on missing file", () => {
    expect(() =>
      patchCastHeader("/nonexistent/path.cast", 80, 24),
    ).not.toThrow();
  });

  test("no-op on file without newline", () => {
    const path = tmpFile('{"version":3}');
    try {
      patchCastHeader(path, 80, 24);
      expect(readFileSync(path, "utf-8")).toBe('{"version":3}');
    } finally {
      unlinkSync(path);
    }
  });
});
