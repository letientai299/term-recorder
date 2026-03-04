import type { TmuxServer } from "./shell.ts";
import type { RecordOptions } from "./types.ts";

export async function createSession(
  server: TmuxServer,
  name: string,
  opts?: Pick<RecordOptions, "env" | "cwd" | "tmux" | "shell">,
): Promise<void> {
  const args = ["new-session", "-d", "-s", name, "-x", "100", "-y", "40"];
  if (opts?.cwd) args.push("-c", opts.cwd);
  await server.tmux(...args);

  // Set default shell for new panes
  if (opts?.shell) {
    await server.tmux("set-option", "-t", name, "default-shell", opts.shell);
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
  // Disable status bar so it doesn't eat a row or cause line-wrap issues
  await server.tmux("set-option", "-t", name, "status", "off");

  if (opts?.tmux?.options) {
    for (const [key, value] of Object.entries(opts.tmux.options)) {
      await server.tmux("set-option", "-t", name, key, value);
    }
  }

  if (opts?.env) {
    for (const [key, value] of Object.entries(opts.env)) {
      await server.tmux("set-environment", "-t", name, key, value);
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
