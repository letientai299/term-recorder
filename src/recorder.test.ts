import { describe, expect, test } from "bun:test";
import { buildAsciinemaCmd } from "./recorder.ts";
import type { TmuxServer } from "./shell.ts";

const server = { socketName: "test-sock", userConf: false } as TmuxServer;

describe("buildAsciinemaCmd", () => {
  test("headless uses exact cols/rows", () => {
    const cmd = buildAsciinemaCmd(server, "sess", "/tmp/out.cast", {
      headless: true,
      cols: 80,
      rows: 24,
    });
    expect(cmd).toContain("--window-size 80x24");
    expect(cmd).toContain("--headless");
  });

  test("headful uses exact cols/rows (no padding)", () => {
    const cmd = buildAsciinemaCmd(server, "sess", "/tmp/out.cast", {
      headless: false,
      cols: 80,
      rows: 24,
    });
    expect(cmd).toContain("--window-size 80x24");
    expect(cmd).not.toContain("--headless");
  });

  test("defaults to DEFAULT_COLS/DEFAULT_ROWS when not specified", () => {
    const headless = buildAsciinemaCmd(server, "sess", "/tmp/out.cast", {
      headless: true,
    });
    expect(headless).toContain("--window-size 120x30");

    const headful = buildAsciinemaCmd(server, "sess", "/tmp/out.cast", {
      headless: false,
    });
    expect(headful).toContain("--window-size 120x30");
  });

  test("always includes --window-size", () => {
    const cmd = buildAsciinemaCmd(server, "sess", "/tmp/out.cast");
    expect(cmd).toContain("--window-size");
  });

  test("uses -f /dev/null when userConf is false", () => {
    const cmd = buildAsciinemaCmd(server, "sess", "/tmp/out.cast");
    expect(cmd).toContain("-f /dev/null");
  });

  test("omits -f /dev/null when userConf is true", () => {
    const srv = { socketName: "test-sock", userConf: true } as TmuxServer;
    const cmd = buildAsciinemaCmd(srv, "sess", "/tmp/out.cast");
    expect(cmd).not.toContain("-f /dev/null");
  });
});
