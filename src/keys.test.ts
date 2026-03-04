import { describe, expect, test } from "bun:test";
import { ctrl, KEYS, resolveKey } from "./keys.ts";

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

describe("resolveKey()", () => {
  test.each([
    ["Enter", "Enter"],
    ["Backspace", "BSpace"],
    ["Delete", "DC"],
    ["Up", "Up"],
    ["F1", "F1"],
  ] as const)("plain key %s → %s", (key, expected) => {
    expect(resolveKey(key)).toBe(expected);
  });

  test.each([
    ["ctrl-c", "C-c"],
    ["ctrl-a", "C-a"],
    ["ctrl-z", "C-z"],
    ["ctrl-Up", "C-Up"],
    ["ctrl-Enter", "C-Enter"],
    ["ctrl-Delete", "C-DC"],
  ] as const)("ctrl combo %s → %s", (key, expected) => {
    expect(resolveKey(key)).toBe(expected);
  });

  test.each([
    ["alt-x", "M-x"],
    ["alt-a", "M-a"],
    ["alt-Tab", "M-Tab"],
    ["alt-F1", "M-F1"],
  ] as const)("alt combo %s → %s", (key, expected) => {
    expect(resolveKey(key)).toBe(expected);
  });

  test.each([
    ["cmd-n", "M-n"],
    ["cmd-a", "M-a"],
    ["cmd-Tab", "M-Tab"],
  ] as const)("cmd combo (macOS alias) %s → %s", (key, expected) => {
    expect(resolveKey(key)).toBe(expected);
  });

  test.each([
    ["opt-x", "M-x"],
    ["opt-a", "M-a"],
    ["opt-F1", "M-F1"],
  ] as const)("opt combo (macOS alias) %s → %s", (key, expected) => {
    expect(resolveKey(key)).toBe(expected);
  });

  test.each([
    ["shift-Tab", "S-Tab"],
    ["shift-Up", "S-Up"],
    ["shift-F12", "S-F12"],
    ["shift-Insert", "S-Insert"],
  ] as const)("shift combo %s → %s", (key, expected) => {
    expect(resolveKey(key)).toBe(expected);
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
