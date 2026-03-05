import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ActionQueue, createSessionProxy, type QueueConfig } from "./queue.ts";
import { startRecording, stopRecording } from "./recorder.ts";
import type { RecordScript } from "./recording.ts";
import { createSession } from "./session.ts";
import { TmuxServer } from "./shell.ts";
import {
  DEFAULT_ACTION_DELAY_MS,
  DEFAULT_PACE_MS,
  DEFAULT_TRAILING_DELAY_MS,
  DEFAULT_TYPING_DELAY_MS,
  type RecordOptions,
  type RunnerConfig,
  type Session,
} from "./types.ts";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Execute a single recording script against a real tmux + asciinema session.
 *
 * This is the low-level execution engine. Most users should use
 * {@link main} + {@link record} instead — `main()` handles CLI flags,
 * output directories, concurrency, and error reporting.
 *
 * Useful when you need full control over the tmux server lifecycle or want
 * to integrate recording into a larger pipeline.
 *
 * @param castFile - Path to the output `.cast` file. Parent directories are created automatically.
 * @param opts - Recording options (terminal size, delays, mode, etc.).
 * @param script - Script callback that queues actions on a {@link Session}.
 * @param server - Optional pre-existing {@link TmuxServer}. If omitted, a temporary server
 *   is created and destroyed after the recording finishes.
 */
export async function executeRecording(
  castFile: string,
  opts: RecordOptions,
  script: RecordScript,
  server?: TmuxServer,
): Promise<void> {
  const name = opts.sessionName ?? `rec-${Date.now()}`;
  const dir = dirname(castFile);
  if (dir !== ".") mkdirSync(dir, { recursive: true });

  const ownsServer = !server;
  const srv =
    server ?? new TmuxServer(`tr-${name}`, opts.loadTmuxConf ?? false);
  let recording: Awaited<ReturnType<typeof startRecording>> | undefined;
  try {
    await createSession(srv, name, opts);

    // Connect control mode early so startRecording's pollPane calls get %output hints
    await srv.connect(name);
    recording = await startRecording(srv, name, castFile, opts);

    const mode = opts.mode ?? "headful";
    const typingDelay = Math.max(
      0,
      opts.typingDelay ?? DEFAULT_TYPING_DELAY_MS,
    );
    const actionDelay = Math.max(
      0,
      opts.actionDelay ?? DEFAULT_ACTION_DELAY_MS,
    );
    const pace = Math.max(0, opts.pace ?? DEFAULT_PACE_MS);
    const trailing = Math.max(
      0,
      opts.trailingDelay ?? DEFAULT_TRAILING_DELAY_MS,
    );

    const queueCfg: QueueConfig = {
      typingDelay,
      actionDelay,
      headless: mode === "headless",
      pace,
    };
    const queue = new ActionQueue(srv, queueCfg);
    const session = createSessionProxy(queue, name);

    const runnerCfg: RunnerConfig = {
      mode,
      cols: opts.cols ?? 100,
      rows: opts.rows ?? 40,
      typingDelay,
      actionDelay,
      trailingDelay: trailing,
      pace,
    };
    const result = script(session, runnerCfg);
    if (result && typeof result.then === "function") {
      await result;
    }
    await queue.drain();

    // Keep the session alive so asciinema records idle time for the last frame.
    // The 50ms base covers asciinema's ~25ms capture interval.
    await sleep(50 + trailing);
  } finally {
    await srv.disconnect();
    await stopRecording(srv, name, recording);
    if (ownsServer) await srv.destroy();
  }
}
