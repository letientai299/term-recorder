import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { executeRecording } from "./execute.ts";
import { castContains, castHeader } from "./test-helpers.test.ts";

const CAST_FILE = "/tmp/test-record.cast";

afterEach(() => {
  if (existsSync(CAST_FILE)) unlinkSync(CAST_FILE);
});

describe("record (e2e)", () => {
  test("produces a valid cast file", async () => {
    await executeRecording(CAST_FILE, { mode: "headless" }, (s) => {
      s.type("echo hello-from-record").enter();
      s.sleep(500);
    });

    expect(existsSync(CAST_FILE)).toBe(true);
    const header = castHeader(CAST_FILE);
    expect(header.version).toBeGreaterThanOrEqual(2);
    expect(castContains(CAST_FILE, "hello-from-record")).toBe(true);
  }, 30_000);
});
