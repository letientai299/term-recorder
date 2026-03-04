import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ActionQueue, createSessionProxy } from "./queue.ts";
import { startRecording, stopRecording } from "./recorder.ts";
import { createSession, killSession } from "./session.ts";
import { initServer, resetServer } from "./shell.ts";
import type { PaneApi, RecordOptions, SessionApi } from "./types.ts";

export type { PaneApi, RecordOptions, SessionApi };
export { ctrl } from "./keys.ts";

/**
 * Record a terminal demo to an asciicast file.
 *
 * The `script` callback receives a session proxy where method calls
 * are queued and executed sequentially against a real tmux session.
 */
export async function record(
  castFile: string,
  opts: RecordOptions,
  script: (s: SessionApi) => void | Promise<void>,
): Promise<void> {
  const name = opts.sessionName ?? `rec-${Date.now()}`;
  const dir = dirname(castFile);
  if (dir !== ".") mkdirSync(dir, { recursive: true });
  // Isolated tmux server — ignores user's tmux.conf by default
  initServer(`tr-${name}`, opts.userTmuxConf ?? false);
  let headfulProc: ReturnType<typeof Bun.spawn> | undefined;
  try {
    await createSession(name, opts.cols ?? 100, opts.rows ?? 30, opts);
    const recording = await startRecording(name, castFile, opts);
    headfulProc = recording.headfulProc;

    const queue = new ActionQueue(name);
    const session = createSessionProxy(queue, name);
    const result = script(session);
    if (result && typeof result.then === "function") {
      await result;
    }
    await queue.drain();

    // Small pause so the final frame is captured
    await Bun.sleep(500);
  } finally {
    await stopRecording(name, headfulProc);
    await killSession(name);
    resetServer();
  }
}
