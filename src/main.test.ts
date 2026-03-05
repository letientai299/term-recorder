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
    expect(flags.cols).toBeUndefined();
    expect(flags.rows).toBeUndefined();
    expect(flags.loadTmuxConf).toBe(false);
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
    [["--cols", "80"], "cols", 80],
    [["--rows", "24"], "rows", 24],
    [["--typing-delay", "50"], "typingDelay", 50],
    [["--action-delay", "100"], "actionDelay", 100],
  ] as const)("parses %j → %s", (args, field, expected) => {
    const flags = parseCliFlags([...args]);
    expect(flags[field]).toBe(expected);
  });

  test("--load-tmux-conf", () => {
    const flags = parseCliFlags(["--load-tmux-conf"]);
    expect(flags.loadTmuxConf).toBe(true);
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

  test.each(["abc", "0"])(
    "invalid numeric --parallel %s returns undefined",
    (val) => {
      expect(parseCliFlags(["--parallel", val]).parallel).toBeUndefined();
    },
  );

  test.each(["abc", "0"])("invalid --cols %s returns undefined", (val) => {
    expect(parseCliFlags(["--cols", val]).cols).toBeUndefined();
  });

  test.each(["abc", "0"])("invalid --rows %s returns undefined", (val) => {
    expect(parseCliFlags(["--rows", val]).rows).toBeUndefined();
  });
});

const defaultCli = parseCliFlags([]);

describe("resolveOptions", () => {
  test("defaults with empty config", () => {
    const opts = resolveOptions({}, defaultCli);
    expect(opts.mode).toBe("headful");
    expect(opts.loadTmuxConf).toBe(false);
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

  test("CLI --cols/--rows override config", () => {
    const cli = parseCliFlags(["--cols", "80", "--rows", "24"]);
    const opts = resolveOptions({ cols: 120, rows: 30 }, cli);
    expect(opts.cols).toBe(80);
    expect(opts.rows).toBe(24);
  });

  test("config cols/rows used when CLI omits them", () => {
    const opts = resolveOptions({ cols: 100, rows: 40 }, defaultCli);
    expect(opts.cols).toBe(100);
    expect(opts.rows).toBe(40);
  });

  test("cols/rows undefined when neither CLI nor config sets them", () => {
    const opts = resolveOptions({}, defaultCli);
    expect(opts.cols).toBeUndefined();
    expect(opts.rows).toBeUndefined();
  });

  test("CLI --typing-delay/--action-delay override config", () => {
    const cli = parseCliFlags([
      "--typing-delay",
      "50",
      "--action-delay",
      "100",
    ]);
    const opts = resolveOptions({ typingDelay: 30, actionDelay: 200 }, cli);
    expect(opts.typingDelay).toBe(50);
    expect(opts.actionDelay).toBe(100);
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
