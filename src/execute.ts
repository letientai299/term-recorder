import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ActionQueue, createSessionProxy, type QueueConfig } from "./queue.ts";
import { startRecording, stopRecording } from "./recorder.ts";
import { createSession } from "./session.ts";
import { TmuxServer } from "./shell.ts";
import {
  DEFAULT_ACTION_DELAY_MS,
  DEFAULT_TYPING_DELAY_MS,
  type RecordOptions,
  type Session,
} from "./types.ts";

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
  script: (s: Session) => void | Promise<void>,
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
    recording = await startRecording(srv, name, castFile, opts);

    // Switch to control mode for the action queue (faster than subprocess-per-command)
    await srv.connect(name);

    const queueCfg: QueueConfig = {
      typingDelay: Math.max(0, opts.typingDelay ?? DEFAULT_TYPING_DELAY_MS),
      actionDelay: Math.max(0, opts.actionDelay ?? DEFAULT_ACTION_DELAY_MS),
      headless: (opts.mode ?? "headful") === "headless",
    };
    const queue = new ActionQueue(srv, queueCfg);
    const session = createSessionProxy(queue, name);
    const result = script(session);
    if (result && typeof result.then === "function") {
      await result;
    }
    await queue.drain();

    // Brief pause so asciinema captures the final frame (~25ms capture interval)
    await Bun.sleep(200);
  } finally {
    // Disconnect control mode before killing sessions
    await srv.disconnect();
    await stopRecording(srv, name, recording);
    if (ownsServer) await srv.destroy();
  }
}
