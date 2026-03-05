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

  test.each([
    [" ", "' '"],
    ['"', "'\"'"],
    ["'", "''\\'''"],
    ["\\", "'\\'"],
    ["#", "'#'"],
    ["{", "'{'"],
    ["}", "'}'"],
    ["$", "'$'"],
    [";", "';'"],
    ["~", "'~'"],
    ["%", "'%'"],
  ])("single-quotes special char %s", (arg, expected) => {
    expect(quoteCcArg(arg)).toBe(expected);
  });

  test("single-quotes args with spaces", () => {
    expect(quoteCcArg("hello world")).toBe("'hello world'");
  });

  test("single-quotes args containing #", () => {
    expect(quoteCcArg("a#b")).toBe("'a#b'");
    expect(quoteCcArg("#!/bin/bash")).toBe("'#!/bin/bash'");
  });

  test.each([
    ["#{pane_id}", "'#{pane_id}'"],
    ["prefix-#{pane_title}-suffix", "'prefix-#{pane_title}-suffix'"],
  ])("single-quotes format sequence %s", (arg, expected) => {
    expect(quoteCcArg(arg)).toBe(expected);
  });

  test.each([
    ["a{b", "'a{b'"],
    ["a}b", "'a}b'"],
    ["a{b}c", "'a{b}c'"],
  ])("single-quotes braces %s", (arg, expected) => {
    expect(quoteCcArg(arg)).toBe(expected);
  });

  test("escapes internal single quotes", () => {
    expect(quoteCcArg("it's #{x}")).toBe("'it'\\''s #{x}'");
  });

  test.each([
    ["-l", "'-l'"],
    ["--flag", "'--flag'"],
  ])("single-quotes dash arg %s", (arg, expected) => {
    expect(quoteCcArg(arg)).toBe(expected);
  });
});
