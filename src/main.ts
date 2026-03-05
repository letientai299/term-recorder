import { cpus } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { Config } from "./config.ts";
import { executeRecording } from "./execute.ts";
import type { Recording } from "./recording.ts";
import { TmuxServer } from "./shell.ts";
import type { RecordOptions } from "./types.ts";

interface CliFlags {
  help: boolean;
  headless: boolean;
  parallel?: number;
  outputDir?: string;
  filter?: string;
  cols?: number;
  rows?: number;
  loadTmuxConf: boolean;
  loadAsciinemaConf: boolean;
  dryRun: boolean;
  trailingDelay?: number;
  pace?: number;
}

export function parseCliFlags(argv: string[]): CliFlags {
  const { values } = parseArgs({
    args: argv,
    options: {
      help: { type: "boolean", default: false, short: "h" },
      headless: { type: "boolean", default: false },
      parallel: { type: "string", short: "p" },
      "output-dir": { type: "string", short: "o" },
      filter: { type: "string", short: "f" },
      cols: { type: "string" },
      rows: { type: "string" },
      "load-tmux-conf": { type: "boolean", default: false },
      "load-asciinema-conf": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      "trailing-delay": { type: "string" },
      pace: { type: "string" },
    },
    strict: true,
  });

  const parseIntOpt = (v: unknown, min = 1): number | undefined => {
    if (v == null) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min) return undefined;
    return Math.floor(n);
  };

  return {
    help: values.help,
    headless: values.headless,
    parallel: parseIntOpt(values.parallel),
    outputDir: values["output-dir"] as string | undefined,
    filter: values.filter as string | undefined,
    cols: parseIntOpt(values.cols),
    rows: parseIntOpt(values.rows),
    loadTmuxConf: values["load-tmux-conf"],
    loadAsciinemaConf: values["load-asciinema-conf"],
    dryRun: values["dry-run"],
    trailingDelay: parseIntOpt(values["trailing-delay"], 0),
    pace: parseIntOpt(values.pace, 0),
  };
}

/** @internal */
export function resolveOptions(config: Config, cli: CliFlags): RecordOptions {
  const { outputDir: _, ...base } = config;
  return {
    ...base,
    mode: cli.headless ? "headless" : (config.mode ?? "headful"),
    cols: cli.cols ?? config.cols,
    rows: cli.rows ?? config.rows,
    loadTmuxConf: cli.loadTmuxConf || (config.loadTmuxConf ?? false),
    loadAsciinemaConf:
      cli.loadAsciinemaConf || (config.loadAsciinemaConf ?? false),
    trailingDelay: cli.trailingDelay ?? config.trailingDelay,
    pace: cli.pace ?? config.pace,
  };
}

const DEFAULT_OUTPUT_DIR = "./casts";

const CLI_OPTIONS: Array<[flags: string, arg: string, desc: string]> = [
  ["-h, --help", "", "Show this help message"],
  ["--headless", "", "Run headless with auto-parallel (cpus/2)"],
  ["-p, --parallel", "N", "Max parallel recordings"],
  ["-o, --output-dir", "DIR", "Output directory (default: ./casts)"],
  ["-f, --filter", "REGEX", "Filter recordings by name"],
  ["--cols", "N", "Terminal columns (default: 120)"],
  ["--rows", "N", "Terminal rows (default: 30)"],
  ["--load-tmux-conf", "", "Load user's tmux.conf"],
  ["--load-asciinema-conf", "", "Load user's asciinema config"],
  ["--trailing-delay", "MS", "Idle time after last action (default: 1000)"],
  ["--pace", "MS", "Default per-pane pace delay (default: 1000, 0 to disable)"],
  ["--dry-run", "", "Print recording names and exit"],
];

function formatHelp(recordings: Recording[], outputDir: string): string {
  const outputs = recordings
    .map((r) => `  ${join(outputDir, `${r.name}.cast`)}`)
    .join("\n");

  const PAD = 28;
  const options = CLI_OPTIONS.map(([flags, arg, desc]) => {
    const left = arg.length > 0 ? `${flags} ${arg}` : flags;
    return `  ${left.padEnd(PAD)}${desc}`;
  }).join("\n");

  return [
    "Record terminal demos to asciicast files.",
    "",
    "Usage: bun <script> [options]",
    "",
    outputs,
    "",
    options,
  ].join("\n");
}

interface RecordingResult {
  name: string;
  durationMs: number;
  error?: Error;
}

async function runOne(
  rec: Recording,
  opts: RecordOptions,
  outputDir: string,
): Promise<RecordingResult> {
  const castFile = join(outputDir, `${rec.name}.cast`);
  const server = new TmuxServer(
    `tr-${rec.name}-${Date.now()}`,
    opts.loadTmuxConf ?? false,
  );
  const start = Date.now();
  try {
    await executeRecording(castFile, opts, rec.script, server);
    return { name: rec.name, durationMs: Date.now() - start };
  } catch (err) {
    return {
      name: rec.name,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  } finally {
    await server.destroy();
  }
}

/**
 * Run recordings with a concurrency limit.
 * Simple semaphore: starts up to `limit` tasks, awaits as each finish.
 */
async function runWithConcurrency(
  tasks: Array<() => Promise<RecordingResult>>,
  limit: number,
): Promise<RecordingResult[]> {
  const results = new Array<RecordingResult>(tasks.length);
  const running = new Set<Promise<void>>();

  for (const [idx, task] of tasks.entries()) {
    const p = task().then((r) => {
      results[idx] = r;
    });
    const tracked = p.then(() => {
      running.delete(tracked);
    });
    running.add(tracked);

    if (running.size >= limit) {
      await Promise.race(running);
    }
  }
  await Promise.all(running);
  return results;
}

function validateUniqueNames(recordings: Recording[]): void {
  const names = new Set<string>();
  for (const rec of recordings) {
    if (names.has(rec.name)) {
      console.error(`Error: duplicate recording name "${rec.name}"`);
      process.exit(1);
    }
    names.add(rec.name);
  }
}

function filterRecordings(
  recordings: Recording[],
  pattern: string,
): Recording[] {
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`Error: invalid --filter regex "${pattern}": ${reason}`);
    process.exit(1);
  }
  const filtered = recordings.filter((r) => re.test(r.name));
  if (filtered.length === 0) {
    console.error(
      `No recordings match filter "${pattern}". Available: ${recordings.map((r) => r.name).join(", ")}`,
    );
    process.exit(1);
  }
  return filtered;
}

function reportResults(results: RecordingResult[]): void {
  let failed = 0;
  for (const r of results) {
    const duration = (r.durationMs / 1000).toFixed(1);
    if (r.error) {
      failed++;
      console.error(`  ✗ ${r.name} (${duration}s) — ${r.error.message}`);
    } else {
      console.log(`  ✓ ${r.name} (${duration}s)`);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} recording(s) failed`);
    process.exit(1);
  }
}

/**
 * Run one or more recordings, writing `.cast` files to disk.
 *
 * Parses `process.argv` for CLI flags (see `--help`), merges them with
 * the provided {@link Config}, validates recording names, and executes
 * with appropriate concurrency.
 *
 * Headful mode runs sequentially. Headless auto-parallelizes to `cpus / 2`
 * unless overridden with `-p`.
 */
export async function main(
  config: Config,
  recordings: Recording[],
): Promise<void> {
  const cli = parseCliFlags(process.argv.slice(2));
  const outputDir = cli.outputDir ?? config.outputDir ?? DEFAULT_OUTPUT_DIR;

  if (cli.help) {
    console.log(formatHelp(recordings, outputDir));
    return;
  }

  validateUniqueNames(recordings);

  const filtered = cli.filter
    ? filterRecordings(recordings, cli.filter)
    : recordings;

  if (cli.dryRun) {
    for (const rec of filtered) {
      console.log(rec.name);
    }
    return;
  }

  const opts = resolveOptions(config, cli);
  const concurrency =
    cli.parallel ??
    (opts.mode === "headless" ? Math.max(1, Math.floor(cpus().length / 2)) : 1);

  console.log(
    `Recording ${filtered.length} cast${filtered.length > 1 ? "s" : ""} → ${outputDir} (${opts.mode}, concurrency: ${concurrency})`,
  );

  const tasks = filtered.map((rec) => () => runOne(rec, opts, outputDir));
  const results = await runWithConcurrency(tasks, concurrency);
  reportResults(results);
}
