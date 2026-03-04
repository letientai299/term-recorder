import { describe, expect, test } from "bun:test";
import { ctrl, KEYS } from "./keys.ts";

describe("KEYS map", () => {
  test.each([
    ["Enter", "Enter"],
    ["Tab", "Tab"],
    ["Escape", "Escape"],
    ["Backspace", "BSpace"],
    ["Space", "Space"],
    ["Up", "Up"],
    ["Down", "Down"],
    ["Right", "Right"],
    ["Left", "Left"],
    ["F1", "F1"],
    ["F5", "F5"],
    ["F12", "F12"],
  ] as const)("KEYS.%s", (key, expected) => {
    expect(KEYS[key]).toBe(expected);
  });
});

describe("ctrl()", () => {
  test.each([
    ["c", "\x03"],
    ["C", "\x03"],
    ["a", "\x01"],
    ["z", "\x1a"],
  ] as const)("ctrl(%s) === expected", (char, expected) => {
    expect(ctrl(char)).toBe(expected);
  });

  test.each([
    ["ab", "expects a single character"],
    ["1", "expects A-Z"],
  ])("throws on invalid input %s", (char, msg) => {
    expect(() => ctrl(char)).toThrow(msg);
  });
});
