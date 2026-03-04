import { describe, expect, test } from "bun:test";
import { defineConfig } from "./config.ts";

describe("defineConfig", () => {
  test("returns the same object", () => {
    const input = { cols: 80, rows: 24, mode: "headless" as const };
    const result = defineConfig(input);
    expect(result).toBe(input);
  });

  test("accepts empty config", () => {
    const result = defineConfig({});
    expect(result).toEqual({});
  });
});
