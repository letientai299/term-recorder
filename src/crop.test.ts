import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cropCast, cropFrameData, tokenize } from "./crop.ts";

const ESC = "\x1b";
const CSI = `${ESC}[`;

describe("tokenize", () => {
  test("splits text and CSI", () => {
    const tokens = tokenize(`hello${CSI}1;2Hworld`);
    expect(tokens).toEqual([
      { type: "text", raw: "hello" },
      { type: "csi", raw: `${CSI}1;2H`, params: "1;2", final: "H" },
      { type: "text", raw: "world" },
    ]);
  });

  test("handles OSC terminated by BEL", () => {
    const tokens = tokenize(`${ESC}]0;title\x07`);
    expect(tokens[0]?.type).toBe("osc");
  });

  test("handles ctrl characters", () => {
    const tokens = tokenize("\r\n");
    expect(tokens).toEqual([
      { type: "ctrl", raw: "\r", code: 0x0d },
      { type: "ctrl", raw: "\n", code: 0x0a },
    ]);
  });

  test("handles CSI with ? prefix", () => {
    const tokens = tokenize(`${CSI}?25h`);
    expect(tokens[0]).toEqual({
      type: "csi",
      raw: `${CSI}?25h`,
      params: "?25",
      final: "h",
    });
  });
});

describe("cropFrameData", () => {
  test("preserves in-bounds content", () => {
    const result = cropFrameData("hello", 80, 24);
    expect(result).toBe("hello");
  });

  test("suppresses out-of-bounds column", () => {
    // Move cursor to col 11, then write — should be suppressed with cols=10
    const data = `${CSI}1;11Hx`;
    const result = cropFrameData(data, 10, 24);
    expect(result).not.toContain("x");
  });

  test("suppresses out-of-bounds row", () => {
    // Move cursor to row 25, then write — should be suppressed with rows=24
    const data = `${CSI}25;1Hy`;
    const result = cropFrameData(data, 80, 24);
    expect(result).not.toContain("y");
  });

  test("SGR passes through regardless of cursor position", () => {
    // Move cursor out of bounds, then SGR
    const data = `${CSI}99;99H${CSI}31m`;
    const result = cropFrameData(data, 10, 10);
    expect(result).toContain(`${CSI}31m`);
  });

  test("lazy cursor emission — no move without subsequent write", () => {
    // Just a cursor move, no write — should produce no output
    const data = `${CSI}5;5H`;
    const result = cropFrameData(data, 80, 24);
    expect(result).toBe("");
  });

  test("lazy cursor emits CUP before in-bounds write", () => {
    const data = `${CSI}3;5Ha`;
    const result = cropFrameData(data, 80, 24);
    expect(result).toBe(`${CSI}3;5Ha`);
  });

  test("OSC passthrough", () => {
    const osc = `${ESC}]0;my title\x07`;
    const result = cropFrameData(osc, 10, 10);
    expect(result).toBe(osc);
  });

  test("DCS passthrough", () => {
    const dcs = `${ESC}Psome data${ESC}\\`;
    const result = cropFrameData(dcs, 10, 10);
    expect(result).toBe(dcs);
  });

  test("mixed in-bounds and border content", () => {
    // Write "A" at (1,1), then "B" at border col (11,1)
    const data = `${CSI}1;1HA${CSI}1;11HB`;
    const result = cropFrameData(data, 10, 10);
    expect(result).toContain("A");
    expect(result).not.toContain("B");
  });

  test("CR+LF across boundary", () => {
    // Start at (1,10) in a 10-row terminal, write a char, then CR+LF
    // Row becomes 11 (out of bounds), subsequent write should be suppressed
    const data = `${CSI}10;1Ha\r\nb`;
    const result = cropFrameData(data, 80, 10);
    expect(result).toContain("a");
    expect(result).not.toContain("b");
  });

  test("scroll region clamping", () => {
    // Set scroll region with bottom > rows
    const data = `${CSI}1;30r`;
    const result = cropFrameData(data, 80, 24);
    expect(result).toBe(`${CSI}1;24r`);
  });

  test("ED in bounds is preserved", () => {
    const data = `${CSI}1;1H${CSI}2J`;
    const result = cropFrameData(data, 80, 24);
    expect(result).toContain(`${CSI}2J`);
  });

  test("ED out of bounds is suppressed", () => {
    const data = `${CSI}25;1H${CSI}2J`;
    const result = cropFrameData(data, 80, 24);
    expect(result).not.toContain(`${CSI}2J`);
  });

  test("relative cursor movement updates tracking", () => {
    // Start at (1,1), move down 5, write "x"
    const data = `${CSI}1;1H${CSI}5Ba`;
    const result = cropFrameData(data, 80, 24);
    // Should emit cursor at row 6
    expect(result).toBe(`${CSI}6;1Ha`);
  });

  test("CHA (cursor horizontal absolute)", () => {
    const data = `${CSI}1;1H${CSI}5Ga`;
    const result = cropFrameData(data, 80, 24);
    expect(result).toBe(`${CSI}1;5Ha`);
  });

  test("ESC sequences pass through", () => {
    // Charset designation
    const data = `${ESC}(B`;
    const result = cropFrameData(data, 80, 24);
    expect(result).toBe(`${ESC}(B`);
  });

  test("BEL passes through", () => {
    const result = cropFrameData("\x07", 80, 24);
    expect(result).toBe("\x07");
  });
});

describe("cropCast", () => {
  const tmpFile = join(tmpdir(), `crop-test-${process.pid}.cast`);

  afterEach(() => {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  });

  test("crops output events in a cast file", () => {
    // Build a minimal cast file with one output event that has border content
    const header = JSON.stringify({ version: 2, width: 10, height: 10 });
    const borderWrite = `${CSI}1;11Hx`;
    const inBoundsWrite = `${CSI}1;1Hy`;
    const event = JSON.stringify([0.5, "o", inBoundsWrite + borderWrite]);
    writeFileSync(tmpFile, `${header}\n${event}\n`);

    cropCast(tmpFile, 10, 10);

    const { readFileSync } = require("node:fs");
    const result = readFileSync(tmpFile, "utf-8");
    const lines = result.trim().split("\n");
    expect(lines.length).toBe(2);
    const [, , data] = JSON.parse(lines[1] ?? "");
    expect(data).toContain("y");
    expect(data).not.toContain("x");
  });

  test("preserves non-output events", () => {
    const header = JSON.stringify({ version: 2, width: 10, height: 10 });
    const inputEvent = JSON.stringify([0.1, "i", "hello"]);
    writeFileSync(tmpFile, `${header}\n${inputEvent}\n`);

    cropCast(tmpFile, 10, 10);

    const { readFileSync } = require("node:fs");
    const result = readFileSync(tmpFile, "utf-8");
    const lines = result.trim().split("\n");
    const parsed = JSON.parse(lines[1] ?? "");
    expect(parsed[2]).toBe("hello");
  });

  test("silently handles missing file", () => {
    // Should not throw
    expect(() => cropCast("/nonexistent/file.cast", 10, 10)).not.toThrow();
  });
});
