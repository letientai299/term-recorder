import { describe, expect, test } from "bun:test";
import { ctrl, KEYS } from "../src/keys.ts";

describe("KEYS map", () => {
  test("contains common keys", () => {
    expect(KEYS.Enter).toBe("\r");
    expect(KEYS.Tab).toBe("\t");
    expect(KEYS.Escape).toBe("\x1b");
    expect(KEYS.Backspace).toBe("\x7f");
    expect(KEYS.Space).toBe(" ");
  });

  test("arrow keys are escape sequences", () => {
    expect(KEYS.Up).toBe("\x1b[A");
    expect(KEYS.Down).toBe("\x1b[B");
    expect(KEYS.Right).toBe("\x1b[C");
    expect(KEYS.Left).toBe("\x1b[D");
  });

  test("function keys are escape sequences", () => {
    expect(KEYS.F1).toBe("\x1bOP");
    expect(KEYS.F5).toBe("\x1b[15~");
    expect(KEYS.F12).toBe("\x1b[24~");
  });
});

describe("ctrl()", () => {
  test("ctrl+c is 0x03", () => {
    expect(ctrl("c")).toBe("\x03");
    expect(ctrl("C")).toBe("\x03");
  });

  test("ctrl+a is 0x01", () => {
    expect(ctrl("a")).toBe("\x01");
  });

  test("ctrl+z is 0x1a", () => {
    expect(ctrl("z")).toBe("\x1a");
  });

  test("throws on multi-char input", () => {
    expect(() => ctrl("ab")).toThrow();
  });

  test("throws on out-of-range characters", () => {
    expect(() => ctrl("1")).toThrow();
  });
});
