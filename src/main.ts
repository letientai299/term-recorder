import { cpus } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { Config } from "./config.ts";
import { executeRecording } from "./execute.ts";
import type { Recording } from "./recording.ts";
import { TmuxServer } from "./shell.ts";
import type { RecordOptions } from "./types.ts";

interface CliFlags {
  headless: boolean;
  headful: boolean;
  concurrency?: number;
  cols?: number;
  rows?: number;
  idleTimeLimit?: number;
  outputDir?: string;
  filter?: string;
  loadTmuxConf: boolean;
  loadAsciinemaConf: boolean;
  dryRun: boolean;
}

export function parseCliFlags(argv: string[]): CliFlags {
  const { values } = parseArgs({
    args: argv,
    options: {
      headless: { type: "boolean", default: false },
      headful: { type: "boolean", default: false },
      concurrency: { type: "string" },
      cols: { type: "string" },
      rows: { type: "string" },
      "idle-time-limit": { type: "string" },
      "output-dir": { type: "string", short: "o" },
      filter: { type: "string", short: "f" },
      "load-tmux-conf": { type: "boolean", default: false },
      "load-asciinema-conf": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: true,
  });

  const parseIntOpt = (v: unknown): number | undefined => {
    if (v == null) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 1) return undefined;
    return Math.floor(n);
  };

  return {
    headless: values.headless === true,
    headful: values.headful === true,
    concurrency: parseIntOpt(values.concurrency),
    cols: parseIntOpt(values.cols),
    rows: parseIntOpt(values.rows),
    idleTimeLimit: parseIntOpt(values["idle-time-limit"]),
    outputDir: values["output-dir"] as string | undefined,
    filter: values.filter as string | undefined,
    loadTmuxConf: values["load-tmux-conf"] === true,
    loadAsciinemaConf: values["load-asciinema-conf"] === true,
    dryRun: values["dry-run"] === true,
  };
}

function resolveOptions(config: Config, cli: CliFlags): RecordOptions {
  // CLI flags > config > built-in defaults
  const mode = cli.headless
    ? "headless"
    : cli.headful
      ? "headful"
      : (config.mode ?? "headful");
  return {
    cols: cli.cols ?? config.cols,
    rows: cli.rows ?? config.rows,
    idleTimeLimit: cli.idleTimeLimit ?? config.idleTimeLimit,
    mode,
    shell: config.shell,
    typingDelay: config.typingDelay,
    actionDelay: config.actionDelay,
    userTmuxConf: cli.loadTmuxConf || (config.userTmuxConf ?? false),
    userAsciinemaConf:
      cli.loadAsciinemaConf || (config.userAsciinemaConf ?? false),
    tmux: config.tmux,
    env: config.env,
    cwd: config.cwd,
  };
}

const DEFAULT_OUTPUT_DIR = "./casts";

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
    opts.userTmuxConf ?? false,
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
 * Simple semaphore: starts up to `limit` tasks, awaits as each finishes.
 */
async function runWithConcurrency(
  tasks: Array<() => Promise<RecordingResult>>,
  limit: number,
): Promise<RecordingResult[]> {
  const results = new Array<RecordingResult>(tasks.length);
  const running = new Set<Promise<void>>();

  for (let i = 0; i < tasks.length; i++) {
    const idx = i;
    const p = tasks[idx]().then((r) => {
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

/**
 * Orchestrate recording execution.
 * Parses CLI flags, merges config, and runs recordings with appropriate concurrency.
 */
export async function main(
  config: Config,
  recordings: Recording[],
): Promise<void> {
  const cli = parseCliFlags(process.argv.slice(2));
  const opts = resolveOptions(config, cli);
  const outputDir = cli.outputDir ?? config.outputDir ?? DEFAULT_OUTPUT_DIR;

  // Validate: no duplicate names
  const names = new Set<string>();
  for (const rec of recordings) {
    if (names.has(rec.name)) {
      console.error(`Error: duplicate recording name "${rec.name}"`);
      process.exit(1);
    }
    names.add(rec.name);
  }

  // Filter by regex
  let filtered = recordings;
  if (cli.filter) {
    let re: RegExp;
    try {
      re = new RegExp(cli.filter);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`Error: invalid --filter regex "${cli.filter}": ${reason}`);
      process.exit(1);
    }
    filtered = recordings.filter((r) => re.test(r.name));
    if (filtered.length === 0) {
      console.error(
        `No recordings match filter "${cli.filter}". Available: ${recordings.map((r) => r.name).join(", ")}`,
      );
      process.exit(1);
    }
  }

  // Dry run: print names and exit
  if (cli.dryRun) {
    for (const rec of filtered) {
      console.log(rec.name);
    }
    return;
  }

  // Determine concurrency: explicit flag > auto (cpus/2 for headless, 1 for headful)
  const concurrency =
    cli.concurrency ??
    (opts.mode === "headless"
      ? Math.max(1, Math.floor(cpus().length / 2))
      : 1);

  console.log(
    `Recording ${filtered.length} cast${filtered.length > 1 ? "s" : ""} → ${outputDir} (${opts.mode}, concurrency: ${concurrency})`,
  );

  const tasks = filtered.map(
    (rec) => () => runOne(rec, opts, outputDir),
  );
  const results = await runWithConcurrency(tasks, concurrency);

  // Report
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
