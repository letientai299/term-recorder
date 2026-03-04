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
  type SessionApi,
} from "./types.ts";

/**
 * Execute a single recording against a real tmux session.
 *
 * This is the internal execution engine. Most users should use
 * `main()` + `record()` instead.
 */
export async function executeRecording(
  castFile: string,
  opts: RecordOptions,
  script: (s: SessionApi) => void | Promise<void>,
  server?: TmuxServer,
): Promise<void> {
  const name = opts.sessionName ?? `rec-${Date.now()}`;
  const dir = dirname(castFile);
  if (dir !== ".") mkdirSync(dir, { recursive: true });

  const ownsServer = !server;
  const srv =
    server ?? new TmuxServer(`tr-${name}`, opts.userTmuxConf ?? false);
  let recording: Awaited<ReturnType<typeof startRecording>> | undefined;
  try {
    await createSession(srv, name, opts.cols ?? 100, opts.rows ?? 30, opts);
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
