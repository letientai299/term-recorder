import type { TmuxServer } from "./shell.ts";
import { DEFAULT_COLS, DEFAULT_ROWS, type RecordOptions } from "./types.ts";

export async function createSession(
  server: TmuxServer,
  name: string,
  opts?: Pick<
    RecordOptions,
    "cols" | "rows" | "env" | "cwd" | "tmux" | "shell"
  >,
): Promise<void> {
  const cols = String(opts?.cols ?? DEFAULT_COLS);
  const rows = String(opts?.rows ?? DEFAULT_ROWS);
  const args = ["new-session", "-d", "-s", name, "-x", cols, "-y", rows];
  if (opts?.cwd) args.push("-c", opts.cwd);
  // Pass env vars via -e so all panes inherit them (tmux 3.2+).
  if (opts?.env) {
    for (const [key, value] of Object.entries(opts.env)) {
      args.push("-e", `${key}=${value}`);
    }
  }
  // shell-command must be last — runs in the initial pane
  if (opts?.shell) args.push(opts.shell);
  await server.tmux(...args);

  // Set default-command so split panes also use the same shell
  if (opts?.shell) {
    await server.tmux("set-option", "-t", name, "default-command", opts.shell);
  }

  // Force 0-based indexing for predictable pane targeting
  await server.tmux("set-option", "-t", name, "base-index", "0");
  await server.tmux("set-option", "-t", name, "-w", "pane-base-index", "0");
  // Move window to index 0 if user config created it at a different index
  if (server.userConf) {
    await server
      .tmux("move-window", "-s", `${name}:1`, "-t", `${name}:0`)
      .catch(() => {});
  }
  // Disable status bar unless the user opted into their tmux.conf —
  // they expect their themed bar visible and accept the lost row.
  if (!server.userConf) {
    await server.tmux("set-option", "-t", name, "status", "off");
  }
  // Prevent tmux from resizing windows to match the attaching client.
  // tmux draws a line border around the window automatically when it is
  // smaller than the client terminal.
  await server.tmux("set-option", "-t", name, "-w", "window-size", "manual");
  await server.tmux("resize-window", "-t", name, "-x", cols, "-y", rows);

  // Cache the server PID for signal-based cleanup (see main.ts).
  if (server.serverPid == null) {
    const pid = await server.tmux("display-message", "-p", "#{pid}");
    server.serverPid = Number(pid);
  }

  if (opts?.tmux?.options) {
    for (const [key, value] of Object.entries(opts.tmux.options)) {
      await server.tmux("set-option", "-t", name, key, value);
    }
  }
}

export async function killSession(
  server: TmuxServer,
  name: string,
): Promise<void> {
  try {
    await server.tmux("kill-session", "-t", name);
  } catch {
    // Ignore errors — session may already be dead
  }
}

export async function splitPane(
  server: TmuxServer,
  session: string,
  direction: "h" | "v",
  percent?: number,
): Promise<string> {
  const args = [
    "split-window",
    `-${direction}`,
    "-t",
    session,
    "-P",
    "-F",
    "#{pane_id}",
  ];
  if (percent != null) args.push("-p", String(percent));
  return server.tmux(...args);
}

export async function listPanes(
  server: TmuxServer,
  session: string,
): Promise<string[]> {
  const out = await server.tmux(
    "list-panes",
    "-t",
    session,
    "-F",
    "#{pane_index}",
  );
  return out.split("\n").filter(Boolean);
}
