import { execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, watch } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { killSession } from "./session.ts";
import type { TmuxServer } from "./shell.ts";
import { DEFAULT_COLS, DEFAULT_ROWS, type RecordOptions } from "./types.ts";

export interface RecordingHandle {
  asciinemaProc?: import("node:child_process").ChildProcess;
  /** Temp dir for asciinema config isolation — cleaned up on stop. */
  ascConfigDir?: string;
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

/**
 * Wait until the cast file exists on disk (proves asciinema wrote its header).
 * Uses fs.watch for instant notification with a stat-poll fallback — kqueue
 * on macOS doesn't always deliver events for files created by child processes
 * in temp directories.
 */
async function waitForCastFile(path: string, timeoutMs: number): Promise<void> {
  if (existsSync(path)) return;
  const dir = dirname(path);
  const name = basename(path);
  await new Promise<void>((ok, fail) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(poll);
      watcher.close();
      ok();
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      watcher.close();
      fail(new Error(`asciinema did not create ${path} within ${timeoutMs}ms`));
    }, timeoutMs);
    const watcher = watch(dir, (_, filename) => {
      if (filename === name && existsSync(path)) done();
    });
    watcher.on("error", () => {
      // Swallow — stat-poll fallback still active
    });
    // Stat-poll fallback for platforms where fs.watch misses events
    const poll = setInterval(() => {
      if (existsSync(path)) done();
    }, 200);
  });
}

/** Shell-escape a value for embedding in a single-quoted string. */
function sq(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/** @internal */
export function buildAsciinemaCmd(
  server: TmuxServer,
  mainSession: string,
  absCast: string,
  opts?: { headless?: boolean; cols?: number; rows?: number },
): string {
  const tmuxFlags = server.userConf ? "" : "-f /dev/null ";
  const attachCmd = `tmux -L ${sq(server.socketName)} ${tmuxFlags}attach -t ${sq(mainSession)}`;
  const headlessFlag = opts?.headless ? " --headless" : "";
  const wCols = opts?.cols ?? DEFAULT_COLS;
  const wRows = opts?.rows ?? DEFAULT_ROWS;
  const sizeFlag = ` --window-size ${wCols}x${wRows}`;
  return `asciinema rec --overwrite${headlessFlag}${sizeFlag} -c ${sq(attachCmd)} ${sq(absCast)}`;
}

async function startHeadful(
  _server: TmuxServer,
  _mainSession: string,
  absCast: string,
  cmd: string,
  env: Record<string, string>,
): Promise<RecordingHandle["asciinemaProc"]> {
  const proc = spawn("sh", ["-c", cmd], {
    stdio: ["inherit", "inherit", "inherit"],
    env: { ...process.env, ...env },
  });
  await waitForCastFile(absCast, 10_000);
  return proc;
}

async function startHeadless(
  _server: TmuxServer,
  _mainSession: string,
  absCast: string,
  cmd: string,
  env: Record<string, string>,
): Promise<RecordingHandle["asciinemaProc"]> {
  const proc = spawn("sh", ["-c", cmd], {
    stdio: "ignore",
    env: { ...process.env, ...env },
  });
  await waitForCastFile(absCast, 10_000);
  return proc;
}

/**
 * Start recording. Both modes spawn asciinema as a child process — headful
 * inherits stdio, headless uses `--headless` with stdio ignored.
 */
export async function startRecording(
  server: TmuxServer,
  mainSession: string,
  castFile: string,
  opts?: Pick<RecordOptions, "mode" | "cols" | "rows" | "loadAsciinemaConf">,
): Promise<RecordingHandle> {
  const mode = opts?.mode ?? "headful";
  const headless = mode === "headless";
  const absCast = resolve(castFile);
  const asc = asciinemaEnv(opts?.loadAsciinemaConf ?? false);
  const cmd = buildAsciinemaCmd(server, mainSession, absCast, {
    headless,
    cols: opts?.cols,
    rows: opts?.rows,
  });

  let asciinemaProc: RecordingHandle["asciinemaProc"];
  if (headless) {
    asciinemaProc = await startHeadless(
      server,
      mainSession,
      absCast,
      cmd,
      asc.env,
    );
  } else {
    asciinemaProc = await startHeadful(
      server,
      mainSession,
      absCast,
      cmd,
      asc.env,
    );
  }
  return { asciinemaProc, ascConfigDir: asc.dir };
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
  await killSession(server, mainSession);

  if (handle?.asciinemaProc) {
    const proc = handle.asciinemaProc;
    await new Promise<void>((resolve) => {
      if (proc.exitCode != null) return resolve();
      // SIGTERM lets asciinema restore the host tty (raw mode, echo, etc.).
      // Only SIGKILL if it doesn't exit within 5s.
      proc.kill("SIGTERM");
      const timer = setTimeout(() => proc.kill("SIGKILL"), 5_000);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    // If asciinema was SIGKILLed it couldn't restore the tty. Reset it so
    // the user's shell isn't left in raw mode with echo disabled.
    if (handle.asciinemaProc.signalCode === "SIGKILL") {
      try {
        execSync("stty sane", { stdio: "inherit" });
      } catch {
        // Best-effort — may fail if stdin isn't a tty (headless)
      }
    }
  }

  if (handle?.ascConfigDir) {
    try {
      rmSync(handle.ascConfigDir, { recursive: true });
    } catch {
      // Ignore — temp dir may already be gone
    }
  }
}
