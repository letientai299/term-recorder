import { describe, expect, test } from "bun:test";
import { quoteCcArg } from "./shell.ts";

describe("quoteCcArg", () => {
  test("returns empty single quotes for empty string", () => {
    expect(quoteCcArg("")).toBe("''");
  });

  test.each(["hello", "send-keys", "0.0"])(
    "passes through simple arg %s",
    (arg) => {
      expect(quoteCcArg(arg)).toBe(arg);
    },
  );

  test("single-quotes args with spaces (tmux tokenizes on whitespace first)", () => {
    expect(quoteCcArg("hello world")).toBe("'hello world'");
  });

  test.each(["'", '"', "\\", "#", "$", "~"])(
    "brace-quotes args containing %s",
    (char) => {
      expect(quoteCcArg(`a${char}b`)).toBe(`{a${char}b}`);
    },
  );

  test("single-quotes args containing semicolons (tmux parses {;} as command block)", () => {
    expect(quoteCcArg("a;b")).toBe("'a;b'");
  });

  test.each([
    ["#{pane_id}", "'#{pane_id}'"],
    ["prefix-#{pane_title}-suffix", "'prefix-#{pane_title}-suffix'"],
  ])("single-quote escapes format sequence %s", (arg, expected) => {
    expect(quoteCcArg(arg)).toBe(expected);
  });

  test.each([
    ["a{b", "'a{b'"],
    ["a}b", "'a}b'"],
  ])("single-quote escapes unbalanced brace %s", (arg, expected) => {
    expect(quoteCcArg(arg)).toBe(expected);
  });

  test("brace-quotes args with balanced braces", () => {
    expect(quoteCcArg("a{b}c")).toBe("{a{b}c}");
  });

  test("escapes internal single quotes via single-quote fallback", () => {
    expect(quoteCcArg("it's #{x}")).toBe("'it'\\''s #{x}'");
  });

  test.each([
    ["-l", "'-l'"],
    ["--flag", "'--flag'"],
  ])("single-quotes dash arg %s", (arg, expected) => {
    expect(quoteCcArg(arg)).toBe(expected);
  });
});
