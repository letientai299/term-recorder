import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { capturePane, sendKeys } from "./pane.ts";
import { createSession, killSession } from "./session.ts";
import { getSocketName, isUserConf } from "./shell.ts";
import type { RecordOptions } from "./types.ts";

function captureSessionName(mainSession: string): string {
  return `${mainSession}-capture`;
}

/**
 * Build the environment for the asciinema process.
 * By default, points ASCIINEMA_CONFIG_HOME to an empty temp dir
 * so user's asciinema config doesn't interfere.
 */
function asciinemaEnv(userAsciinemaConf: boolean): Record<string, string> {
  if (userAsciinemaConf) return {};
  const emptyDir = mkdtempSync(join(tmpdir(), "tr-asc-"));
  return { ASCIINEMA_CONFIG_HOME: emptyDir };
}

/**
 * Start recording. In headless mode, a detached tmux session runs asciinema.
 * In headful mode, asciinema runs in the foreground via a spawned terminal process
 * so the user sees the tmux session live.
 */
export async function startRecording(
  mainSession: string,
  castFile: string,
  opts?: Pick<
    RecordOptions,
    "idleTimeLimit" | "cols" | "rows" | "mode" | "userAsciinemaConf"
  >,
): Promise<{ headfulProc?: ReturnType<typeof Bun.spawn> }> {
  const mode = opts?.mode ?? "headful";
  const absCast = resolve(castFile);
  const ascEnv = asciinemaEnv(opts?.userAsciinemaConf ?? false);

  // Build the tmux attach command with the isolated socket
  const socket = getSocketName();
  const tmuxFlags = socket
    ? `-L ${socket}${isUserConf() ? "" : " -f /dev/null"}`
    : "";
  const attachCmd = tmuxFlags
    ? `tmux ${tmuxFlags} attach -t ${mainSession}`
    : `tmux attach -t ${mainSession}`;

  // Build asciinema command
  let cmd = "asciinema rec --overwrite";
  if (opts?.idleTimeLimit != null) {
    cmd += ` --idle-time-limit ${opts.idleTimeLimit}`;
  }
  cmd += ` -c "${attachCmd}" ${absCast}`;

  if (mode === "headful") {
    const proc = Bun.spawn(["sh", "-c", cmd], {
      stdio: ["inherit", "inherit", "inherit"],
      env: { ...process.env, ...ascEnv },
    });
    await Bun.sleep(1500);
    return { headfulProc: proc };
  }

  // Headless: run in a detached tmux capture session
  const captureName = captureSessionName(mainSession);
  const cols = opts?.cols ?? 100;
  const rows = opts?.rows ?? 30;

  await createSession(captureName, cols, rows);

  // Set asciinema env vars in the capture session
  for (const [key, value] of Object.entries(ascEnv)) {
    await sendKeys(`${captureName}:0.0`, `export ${key}="${value}"`, true);
    await sendKeys(`${captureName}:0.0`, "\r", false);
    await Bun.sleep(100);
  }

  await sendKeys(`${captureName}:0.0`, cmd, true);
  await sendKeys(`${captureName}:0.0`, "\r", false);

  // Wait for asciinema to start and tmux to attach
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const content = await capturePane(`${captureName}:0.0`);
    if (content.trim().length > 0 && !content.includes("asciinema rec")) {
      break;
    }
    await Bun.sleep(200);
  }
  await Bun.sleep(500);
  return {};
}

/**
 * Stop recording by killing the main session, which causes tmux attach to exit,
 * which causes asciinema to finish writing the cast file.
 */
export async function stopRecording(
  mainSession: string,
  headfulProc?: ReturnType<typeof Bun.spawn>,
): Promise<void> {
  const captureName = captureSessionName(mainSession);

  // Kill the main session → tmux attach exits → asciinema finishes
  await killSession(mainSession);

  if (headfulProc) {
    await headfulProc.exited;
  } else {
    await Bun.sleep(1000);
    await killSession(captureName);
  }
}
