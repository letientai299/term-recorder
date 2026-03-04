import { describe, expect, test } from "bun:test";
import { record } from "./recording.ts";

const noop = () => {};

describe("record (lazy)", () => {
  test("returns a Recording descriptor without executing", () => {
    let called = false;
    const rec = record("test", () => {
      called = true;
    });
    expect(rec.name).toBe("test");
    expect(typeof rec.script).toBe("function");
    expect(called).toBe(false);
  });

  test.each(["basic", "my-demo", "v1.0", "group/sub", "a_b"])(
    "accepts valid name %s",
    (name) => {
      expect(() => record(name, noop)).not.toThrow();
    },
  );

  test.each(["foo$(whoami)", "foo; rm -rf /", 'foo"bar', "foo bar", "foo`id`"])(
    "rejects shell metacharacter name %s",
    (name) => {
      expect(() => record(name, noop)).toThrow("Invalid recording name");
    },
  );

  test("rejects path traversal", () => {
    expect(() => record("../../etc/evil", noop)).toThrow("path traversal");
  });

  test("rejects empty name", () => {
    expect(() => record("", noop)).toThrow("Invalid recording name");
  });
});
