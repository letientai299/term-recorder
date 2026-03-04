import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { capturePane, sendKeys } from "./pane.ts";
import { createSession, killSession } from "./session.ts";
import type { TmuxServer } from "./shell.ts";
import type { RecordOptions } from "./types.ts";

function captureSessionName(mainSession: string): string {
  return `${mainSession}-capture`;
}

export interface RecordingHandle {
  headfulProc?: ReturnType<typeof Bun.spawn>;
  /** Temp dir for asciinema config isolation — cleaned up on stop. */
  ascConfigDir?: string;
}

/**
 * Build the environment for the asciinema process.
 * By default, points ASCIINEMA_CONFIG_HOME to an empty temp dir
 * so user's asciinema config doesn't interfere.
 */
function asciinemaEnv(userAsciinemaConf: boolean): {
  env: Record<string, string>;
  dir?: string;
} {
  if (userAsciinemaConf) return { env: {} };
  const dir = mkdtempSync(join(tmpdir(), "tr-asc-"));
  return { env: { ASCIINEMA_CONFIG_HOME: dir }, dir };
}

/**
 * Start recording. In headless mode, a detached tmux session runs asciinema.
 * In headful mode, asciinema runs in the foreground via a spawned terminal process
 * so the user sees the tmux session live.
 */
export async function startRecording(
  server: TmuxServer,
  mainSession: string,
  castFile: string,
  opts?: Pick<
    RecordOptions,
    "idleTimeLimit" | "cols" | "rows" | "mode" | "userAsciinemaConf"
  >,
): Promise<RecordingHandle> {
  const mode = opts?.mode ?? "headful";
  const absCast = resolve(castFile);
  const asc = asciinemaEnv(opts?.userAsciinemaConf ?? false);

  // Build the tmux attach command with the isolated socket
  const tmuxFlags = `${server.userConf ? "" : "-f /dev/null "}`;
  const attachCmd = `tmux -L ${server.socketName} ${tmuxFlags}attach -t ${mainSession}`;

  // Build asciinema command
  let cmd = "asciinema rec --overwrite";
  if (opts?.idleTimeLimit != null) {
    cmd += ` --idle-time-limit ${opts.idleTimeLimit}`;
  }
  cmd += ` -c "${attachCmd}" ${absCast}`;

  if (mode === "headful") {
    const proc = Bun.spawn(["sh", "-c", cmd], {
      stdio: ["inherit", "inherit", "inherit"],
      env: { ...process.env, ...asc.env },
    });
    await Bun.sleep(1500);
    return { headfulProc: proc, ascConfigDir: asc.dir };
  }

  // Headless: run in a detached tmux capture session
  const captureName = captureSessionName(mainSession);
  const cols = opts?.cols ?? 100;
  const rows = opts?.rows ?? 30;

  await createSession(server, captureName, cols, rows);

  // Set asciinema env vars via tmux set-environment (no shell eval)
  for (const [key, value] of Object.entries(asc.env)) {
    await server.tmux("set-environment", "-t", captureName, key, value);
  }
  // Respawn the pane so it inherits the new environment
  await server.tmux("respawn-pane", "-t", `${captureName}:0.0`, "-k");
  await Bun.sleep(300);

  await sendKeys(server, `${captureName}:0.0`, cmd);
  await sendKeys(server, `${captureName}:0.0`, "\r", false);

  // Wait for asciinema to start and tmux to attach
  const deadline = Date.now() + 10_000;
  let ready = false;
  while (Date.now() < deadline) {
    const content = await capturePane(server, `${captureName}:0.0`);
    if (content.trim().length > 0 && !content.includes("asciinema rec")) {
      ready = true;
      break;
    }
    await Bun.sleep(200);
  }
  if (!ready) {
    throw new Error(
      `asciinema failed to start within 10s for session ${mainSession}`,
    );
  }
  await Bun.sleep(500);
  return { ascConfigDir: asc.dir };
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

  // Kill the main session → tmux attach exits → asciinema finishes
  await killSession(server, mainSession);

  if (handle?.headfulProc) {
    await handle.headfulProc.exited;
  } else {
    await Bun.sleep(1000);
    await killSession(server, captureName);
  }

  // Clean up temp asciinema config dir
  if (handle?.ascConfigDir) {
    try {
      rmSync(handle.ascConfigDir, { recursive: true });
    } catch {
      // Ignore — temp dir may already be gone
    }
  }
}
