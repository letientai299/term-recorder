import { describe, expect, test } from "bun:test";
import { quoteCcArg } from "./shell.ts";

describe("quoteCcArg", () => {
  test("returns empty single quotes for empty string", () => {
    expect(quoteCcArg("")).toBe("''");
  });

  test("passes through simple alphanumeric args", () => {
    expect(quoteCcArg("hello")).toBe("hello");
    expect(quoteCcArg("send-keys")).toBe("send-keys");
    expect(quoteCcArg("0.0")).toBe("0.0");
  });

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

  test("single-quote escapes args with tmux format sequences", () => {
    expect(quoteCcArg("#{pane_id}")).toBe("'#{pane_id}'");
    expect(quoteCcArg("prefix-#{pane_title}-suffix")).toBe(
      "'prefix-#{pane_title}-suffix'",
    );
  });

  test("single-quote escapes args with unbalanced braces", () => {
    expect(quoteCcArg("a{b")).toBe("'a{b'");
    expect(quoteCcArg("a}b")).toBe("'a}b'");
  });

  test("brace-quotes args with balanced braces", () => {
    expect(quoteCcArg("a{b}c")).toBe("{a{b}c}");
  });

  test("escapes internal single quotes via single-quote fallback", () => {
    expect(quoteCcArg("it's #{x}")).toBe("'it'\\''s #{x}'");
  });

  test("single-quotes args starting with dash (tmux treats {-x} as command block)", () => {
    expect(quoteCcArg("-l")).toBe("'-l'");
    expect(quoteCcArg("--flag")).toBe("'--flag'");
  });
});
