import { mkdtempSync, rmSync, statSync, watch } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sendKeys } from "./pane.ts";
import { createSession, killSession } from "./session.ts";
import type { TmuxServer } from "./shell.ts";
import type { RecordOptions } from "./types.ts";
import { pollPane } from "./wait.ts";

function captureSessionName(mainSession: string): string {
  return `${mainSession}-capture`;
}

export interface RecordingHandle {
  headfulProc?: ReturnType<typeof Bun.spawn>;
  /** Temp dir for asciinema config isolation — cleaned up on stop. */
  ascConfigDir?: string;
  /** Absolute path to the cast file — used to poll for writing completion. */
  castFile?: string;
}

/**
 * Build the environment for the asciinema process.
 * By default, points ASCIINEMA_CONFIG_HOME to an empty temp dir
 * so the user's asciinema config doesn't interfere.
 */
function asciinemaEnv(loadConf: boolean): {
  env: Record<string, string>;
  dir?: string;
} {
  if (loadConf) return { env: {} };
  const dir = mkdtempSync(join(tmpdir(), "tr-asc-"));
  return { env: { ASCIINEMA_CONFIG_HOME: dir }, dir };
}

/** Poll until the pane has non-empty content, or throw after timeout. */
async function waitForPaneContent(
  server: TmuxServer,
  target: string,
  timeoutMs: number,
  label: string,
): Promise<void> {
  return pollPane(
    server,
    target,
    (c) => c.trim().length > 0,
    timeoutMs,
    label,
    { suppressErrors: true },
  );
}

function buildAsciinemaCmd(
  server: TmuxServer,
  mainSession: string,
  absCast: string,
): string {
  const tmuxFlags = server.userConf ? "" : "-f /dev/null ";
  const attachCmd = `tmux -L ${server.socketName} ${tmuxFlags}attach -t ${mainSession}`;
  return `asciinema rec --overwrite -c "${attachCmd}" ${absCast}`;
}

async function startHeadful(
  server: TmuxServer,
  mainSession: string,
  cmd: string,
  env: Record<string, string>,
): Promise<RecordingHandle["headfulProc"]> {
  const proc = Bun.spawn(["sh", "-c", cmd], {
    stdio: ["inherit", "inherit", "inherit"],
    env: { ...process.env, ...env },
  });
  await waitForPaneContent(
    server,
    `${mainSession}:0.0`,
    10_000,
    "headful startup",
  );
  return proc;
}

async function startHeadless(
  server: TmuxServer,
  mainSession: string,
  cmd: string,
  env: Record<string, string>,
): Promise<void> {
  const captureName = captureSessionName(mainSession);
  await createSession(server, captureName, { env });
  await server.tmux("respawn-pane", "-t", `${captureName}:0.0`, "-k");
  await waitForPaneContent(server, `${captureName}:0.0`, 5_000, "respawn-pane");

  await sendKeys(server, `${captureName}:0.0`, cmd);
  await sendKeys(server, `${captureName}:0.0`, "\r", false);

  await pollPane(
    server,
    `${captureName}:0.0`,
    (c) => c.trim().length > 0 && !c.includes("asciinema rec"),
    10_000,
    `asciinema failed to start within 10s for session ${mainSession}`,
    { suppressErrors: true },
  );

  await waitForPaneContent(
    server,
    `${mainSession}:0.0`,
    5_000,
    "headless main session",
  );
}

/**
 * Start recording. In headful mode, asciinema runs in the foreground.
 * In headless mode, a detached tmux capture session runs asciinema.
 */
export async function startRecording(
  server: TmuxServer,
  mainSession: string,
  castFile: string,
  opts?: Pick<RecordOptions, "mode" | "loadAsciinemaConf">,
): Promise<RecordingHandle> {
  const mode = opts?.mode ?? "headful";
  const absCast = resolve(castFile);
  const asc = asciinemaEnv(opts?.loadAsciinemaConf ?? false);
  const cmd = buildAsciinemaCmd(server, mainSession, absCast);

  let headfulProc: RecordingHandle["headfulProc"];
  if (mode === "headful") {
    headfulProc = await startHeadful(server, mainSession, cmd, asc.env);
  } else {
    await startHeadless(server, mainSession, cmd, asc.env);
  }
  return { headfulProc, ascConfigDir: asc.dir, castFile: absCast };
}

/**
 * Wait until the cast file stops being written to.
 * Uses fs.watch() to detect changes and resolves after 150ms of silence.
 * Falls back to statSync polling if fs.watch() is unavailable.
 */
async function waitForCastStable(
  castFile: string,
  timeoutMs: number,
): Promise<void> {
  try {
    await waitForCastStableWatch(castFile, timeoutMs);
  } catch {
    await waitForCastStablePoll(castFile, timeoutMs);
  }
}

/** Primary: fs.watch()-based silence detection. */
function waitForCastStableWatch(
  castFile: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const watcher = watch(castFile);
    let silenceTimer = setTimeout(done, 150);
    const deadline = setTimeout(() => done(), timeoutMs);

    function done() {
      clearTimeout(silenceTimer);
      clearTimeout(deadline);
      watcher.close();
      resolve();
    }

    watcher.on("change", () => {
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(done, 150);
    });

    watcher.on("error", (err) => {
      clearTimeout(silenceTimer);
      clearTimeout(deadline);
      watcher.close();
      reject(err);
    });
  });
}

/** Fallback: poll statSync for 3 consecutive stable reads. */
async function waitForCastStablePoll(
  castFile: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastSize = -1;
  let stableCount = 0;
  while (Date.now() < deadline) {
    try {
      const { size } = statSync(castFile);
      if (size > 0 && size === lastSize) {
        if (++stableCount >= 3) return;
      } else {
        stableCount = 0;
      }
      lastSize = size;
    } catch {
      stableCount = 0;
    }
    await Bun.sleep(100);
  }
}

/**
 * Stop recording by killing the main session, which causes tmux attach to exit,
 * which causes asciinema to finish writing the cast file.
 */
export async function stopRecording(
  server: TmuxServer,
  mainSession: string,
  handle?: RecordingHandle,
): Promise<void> {
  const captureName = captureSessionName(mainSession);
  await killSession(server, mainSession);

  if (handle?.headfulProc) {
    await handle.headfulProc.exited;
  } else {
    if (handle?.castFile) {
      await waitForCastStable(handle.castFile, 10_000);
    }
    await killSession(server, captureName);
  }

  if (handle?.ascConfigDir) {
    try {
      rmSync(handle.ascConfigDir, { recursive: true });
    } catch {
      // Ignore — temp dir may already be gone
    }
  }
}
