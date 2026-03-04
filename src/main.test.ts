import { describe, expect, test } from "bun:test";
import { parseCliFlags, resolveOptions } from "./main.ts";

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

  test.each([
    [["--help"], "help", true],
    [["-h"], "help", true],
    [["--headless"], "headless", true],
    [["-p", "4"], "parallel", 4],
    [["--parallel", "2"], "parallel", 2],
    [["-o", "./out"], "outputDir", "./out"],
    [["--output-dir", "/tmp/casts"], "outputDir", "/tmp/casts"],
    [["-f", "basic"], "filter", "basic"],
    [["--filter", "^demo"], "filter", "^demo"],
    [["--dry-run"], "dryRun", true],
  ] as const)("parses %j → %s", (args, field, expected) => {
    const flags = parseCliFlags([...args]);
    expect(flags[field]).toBe(expected);
  });

  test("--load-tmux-conf and --load-asciinema-conf", () => {
    const flags = parseCliFlags(["--load-tmux-conf", "--load-asciinema-conf"]);
    expect(flags.loadTmuxConf).toBe(true);
    expect(flags.loadAsciinemaConf).toBe(true);
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

  test.each(["abc", "0"])(
    "invalid numeric --parallel %s returns undefined",
    (val) => {
      expect(parseCliFlags(["--parallel", val]).parallel).toBeUndefined();
    },
  );
});

const defaultCli = parseCliFlags([]);

describe("resolveOptions", () => {
  test("defaults with empty config", () => {
    const opts = resolveOptions({}, defaultCli);
    expect(opts.mode).toBe("headful");
    expect(opts.loadTmuxConf).toBe(false);
    expect(opts.loadAsciinemaConf).toBe(false);
  });

  test("--headless CLI flag overrides config mode", () => {
    const cli = parseCliFlags(["--headless"]);
    const opts = resolveOptions({ mode: "headful" }, cli);
    expect(opts.mode).toBe("headless");
  });

  test("config mode used when CLI does not set headless", () => {
    const opts = resolveOptions({ mode: "headless" }, defaultCli);
    expect(opts.mode).toBe("headless");
  });

  test("CLI loadTmuxConf OR config loadTmuxConf", () => {
    expect(
      resolveOptions({ loadTmuxConf: true }, defaultCli).loadTmuxConf,
    ).toBe(true);
    const cli = parseCliFlags(["--load-tmux-conf"]);
    expect(resolveOptions({}, cli).loadTmuxConf).toBe(true);
    expect(resolveOptions({ loadTmuxConf: false }, cli).loadTmuxConf).toBe(
      true,
    );
  });

  test("passes through config fields", () => {
    const opts = resolveOptions(
      {
        shell: "/bin/zsh",
        typingDelay: 50,
        actionDelay: 100,
        tmux: { options: { "status-style": "bg=red" } },
        env: { FOO: "bar" },
        cwd: "/tmp",
      },
      defaultCli,
    );
    expect(opts.shell).toBe("/bin/zsh");
    expect(opts.typingDelay).toBe(50);
    expect(opts.actionDelay).toBe(100);
    expect(opts.tmux?.options?.["status-style"]).toBe("bg=red");
    expect(opts.env?.FOO).toBe("bar");
    expect(opts.cwd).toBe("/tmp");
  });
});
