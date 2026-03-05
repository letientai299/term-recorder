import { cpus } from "node:os";
import { join } from "node:path";
import type { ArgsDef } from "citty";
import { parseArgs as cittyParseArgs, defineCommand, renderUsage } from "citty";
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
  dryRun: boolean;
  trailingDelay?: number;
  pace?: number;
  typingDelay?: number;
  actionDelay?: number;
}

const argsDef = {
  help: {
    type: "boolean",
    alias: "h",
    description: "Show this help message",
    default: false,
  },
  headless: {
    type: "boolean",
    description: "No visible terminal; auto-parallel at cpus/2",
    default: false,
  },
  parallel: {
    type: "string",
    alias: "p",
    description:
      "Max concurrent recordings (default: 1, or cpus/2 if headless)",
    valueHint: "N",
  },
  "output-dir": {
    type: "string",
    alias: "o",
    description: "Output directory (default: ./casts)",
    valueHint: "DIR",
  },
  filter: {
    type: "string",
    alias: "f",
    description: "Run only recordings whose name matches this regex",
    valueHint: "REGEX",
  },
  cols: {
    type: "string",
    description: "Terminal columns (default: 120)",
    valueHint: "N",
  },
  rows: {
    type: "string",
    description: "Terminal rows (default: 30)",
    valueHint: "N",
  },
  "load-tmux-conf": {
    type: "boolean",
    description: "Use your tmux.conf instead of a clean config",
    default: false,
  },
  "dry-run": {
    type: "boolean",
    description: "Print recording names and exit",
    default: false,
  },
  "trailing-delay": {
    type: "string",
    description:
      "Idle time before ending so the last frame stays visible (default: 1000)",
    valueHint: "MS",
  },
  pace: {
    type: "string",
    description: "Delay after each pane action (default: 1000, 0 to disable)",
    valueHint: "MS",
  },
  "typing-delay": {
    type: "string",
    description: "Per-character delay for type() actions (default: 30)",
    valueHint: "MS",
  },
  "action-delay": {
    type: "string",
    description: "Auto-pause inserted between queued actions (default: 200)",
    valueHint: "MS",
  },
} satisfies ArgsDef;

/** Known long-flag names derived from argsDef, used to detect unknown flags. */
const knownFlags = new Set<string>();
for (const [key, def] of Object.entries(argsDef)) {
  knownFlags.add(`--${key}`);
  const alias = "alias" in def ? def.alias : undefined;
  const aliases = Array.isArray(alias) ? alias : alias ? [alias] : [];
  for (const a of aliases) {
    knownFlags.add(a.length === 1 ? `-${a}` : `--${a}`);
  }
}

export function parseCliFlags(argv: string[]): CliFlags {
  // Warn about unknown flags (citty silently drops them)
  for (const arg of argv) {
    if (arg === "--") break;
    const flag = arg.split("=")[0] ?? arg;
    if (arg.startsWith("-") && !knownFlags.has(flag)) {
      console.warn(`Warning: unknown flag "${arg}"`);
    }
  }

  const parsed = cittyParseArgs(argv, argsDef);

  const parseIntOpt = (v: unknown, min = 1): number | undefined => {
    if (v == null) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min) return undefined;
    return Math.floor(n);
  };

  return {
    help: parsed.help ?? false,
    headless: parsed.headless ?? false,
    parallel: parseIntOpt(parsed.parallel),
    outputDir: parsed["output-dir"],
    filter: parsed.filter,
    cols: parseIntOpt(parsed.cols),
    rows: parseIntOpt(parsed.rows),
    loadTmuxConf: parsed["load-tmux-conf"] ?? false,
    dryRun: parsed["dry-run"] ?? false,
    trailingDelay: parseIntOpt(parsed["trailing-delay"], 0),
    pace: parseIntOpt(parsed.pace, 0),
    typingDelay: parseIntOpt(parsed["typing-delay"], 0),
    actionDelay: parseIntOpt(parsed["action-delay"], 0),
  };
}

/** @internal */
export function resolveOptions(config: Config, cli: CliFlags): RecordOptions {
  const { outputDir: _, ...base } = config;
  const cliOverrides: Partial<RecordOptions> = {
    ...(cli.headless ? { mode: "headless" as const } : undefined),
    ...(cli.cols != null ? { cols: cli.cols } : undefined),
    ...(cli.rows != null ? { rows: cli.rows } : undefined),
    ...(cli.loadTmuxConf ? { loadTmuxConf: true } : undefined),
    ...(cli.trailingDelay != null
      ? { trailingDelay: cli.trailingDelay }
      : undefined),
    ...(cli.pace != null ? { pace: cli.pace } : undefined),
    ...(cli.typingDelay != null ? { typingDelay: cli.typingDelay } : undefined),
    ...(cli.actionDelay != null ? { actionDelay: cli.actionDelay } : undefined),
  };
  return {
    ...base,
    mode: config.mode ?? "headful",
    loadTmuxConf: config.loadTmuxConf ?? false,
    ...cliOverrides,
  };
}

const DEFAULT_OUTPUT_DIR = "./casts";

const cliCommand = defineCommand({
  meta: {
    name: "term-recorder",
    description: "Record terminal demos to asciicast files.",
  },
  args: argsDef,
});

async function formatHelp(): Promise<string> {
  return await renderUsage(cliCommand);
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
    console.log(await formatHelp());
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
