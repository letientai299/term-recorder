import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { record } from "../src/index.ts";
import { castCols, castContains, castHeader, castRows } from "./helpers.ts";

const CAST_FILE = "/tmp/test-record.cast";

afterEach(() => {
  if (existsSync(CAST_FILE)) unlinkSync(CAST_FILE);
});

describe("record (e2e)", () => {
  test("produces a valid cast file", async () => {
    await record(CAST_FILE, { cols: 80, rows: 24, idleTimeLimit: 2, mode: "headless" }, (s) => {
      s.type("echo hello-from-record").enter();
      s.sleep(1000);
    });

    expect(existsSync(CAST_FILE)).toBe(true);
    const header = castHeader(CAST_FILE);
    expect(header.version).toBeGreaterThanOrEqual(2);
    expect(castCols(header)).toBe(80);
    expect(castRows(header)).toBe(24);
    expect(castContains(CAST_FILE, "hello-from-record")).toBe(true);
  }, 30_000);
});
