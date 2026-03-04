import { describe, expect, test } from "bun:test";
import { parseCliFlags } from "./main.ts";

describe("parseCliFlags", () => {
  test("defaults", () => {
    const flags = parseCliFlags([]);
    expect(flags.headless).toBe(false);
    expect(flags.headful).toBe(false);
    expect(flags.concurrency).toBeUndefined();
    expect(flags.cols).toBeUndefined();
    expect(flags.rows).toBeUndefined();
    expect(flags.idleTimeLimit).toBeUndefined();
    expect(flags.outputDir).toBeUndefined();
    expect(flags.filter).toBeUndefined();
    expect(flags.loadTmuxConf).toBe(false);
    expect(flags.loadAsciinemaConf).toBe(false);
    expect(flags.dryRun).toBe(false);
  });

  test("--headless", () => {
    expect(parseCliFlags(["--headless"]).headless).toBe(true);
  });

  test("--headful", () => {
    expect(parseCliFlags(["--headful"]).headful).toBe(true);
  });

  test("--concurrency", () => {
    expect(parseCliFlags(["--concurrency", "4"]).concurrency).toBe(4);
  });

  test("--cols and --rows", () => {
    const flags = parseCliFlags(["--cols", "120", "--rows", "40"]);
    expect(flags.cols).toBe(120);
    expect(flags.rows).toBe(40);
  });

  test("--idle-time-limit", () => {
    expect(parseCliFlags(["--idle-time-limit", "3"]).idleTimeLimit).toBe(3);
  });

  test("-o / --output-dir", () => {
    expect(parseCliFlags(["-o", "./out"]).outputDir).toBe("./out");
    expect(parseCliFlags(["--output-dir", "/tmp/casts"]).outputDir).toBe(
      "/tmp/casts",
    );
  });

  test("-f / --filter", () => {
    expect(parseCliFlags(["-f", "basic"]).filter).toBe("basic");
    expect(parseCliFlags(["--filter", "^demo"]).filter).toBe("^demo");
  });

  test("--load-tmux-conf and --load-asciinema-conf", () => {
    const flags = parseCliFlags([
      "--load-tmux-conf",
      "--load-asciinema-conf",
    ]);
    expect(flags.loadTmuxConf).toBe(true);
    expect(flags.loadAsciinemaConf).toBe(true);
  });

  test("--dry-run", () => {
    expect(parseCliFlags(["--dry-run"]).dryRun).toBe(true);
  });

  test("combined flags", () => {
    const flags = parseCliFlags([
      "--headless",
      "-o",
      "./casts",
      "-f",
      "split",
      "--concurrency",
      "2",
      "--dry-run",
    ]);
    expect(flags.headless).toBe(true);
    expect(flags.outputDir).toBe("./casts");
    expect(flags.filter).toBe("split");
    expect(flags.concurrency).toBe(2);
    expect(flags.dryRun).toBe(true);
  });

  test("rejects unknown flags (strict mode)", () => {
    expect(() => parseCliFlags(["--headles"])).toThrow();
  });

  test("invalid numeric values return undefined", () => {
    expect(parseCliFlags(["--concurrency", "abc"]).concurrency).toBeUndefined();
    expect(parseCliFlags(["--cols", "0"]).cols).toBeUndefined();
  });
});
