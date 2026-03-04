import { describe, expect, test } from "bun:test";
import { parseCliFlags } from "./main.ts";

describe("parseCliFlags", () => {
  test("defaults", () => {
    const flags = parseCliFlags([]);
    expect(flags.help).toBe(false);
    expect(flags.headless).toBe(false);
    expect(flags.parallel).toBeUndefined();
    expect(flags.outputDir).toBeUndefined();
    expect(flags.filter).toBeUndefined();
    expect(flags.loadTmuxConf).toBe(false);
    expect(flags.loadAsciinemaConf).toBe(false);
    expect(flags.dryRun).toBe(false);
  });

  test("--help / -h", () => {
    expect(parseCliFlags(["--help"]).help).toBe(true);
    expect(parseCliFlags(["-h"]).help).toBe(true);
  });

  test("--headless", () => {
    expect(parseCliFlags(["--headless"]).headless).toBe(true);
  });

  test("-p / --parallel", () => {
    expect(parseCliFlags(["-p", "4"]).parallel).toBe(4);
    expect(parseCliFlags(["--parallel", "2"]).parallel).toBe(2);
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
      "-p",
      "2",
      "--dry-run",
    ]);
    expect(flags.headless).toBe(true);
    expect(flags.outputDir).toBe("./casts");
    expect(flags.filter).toBe("split");
    expect(flags.parallel).toBe(2);
    expect(flags.dryRun).toBe(true);
  });

  test("rejects unknown flags (strict mode)", () => {
    expect(() => parseCliFlags(["--headles"])).toThrow();
  });

  test("invalid numeric values return undefined", () => {
    expect(parseCliFlags(["--parallel", "abc"]).parallel).toBeUndefined();
    expect(parseCliFlags(["--parallel", "0"]).parallel).toBeUndefined();
  });
});
