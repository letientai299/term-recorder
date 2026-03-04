import { tmux } from "./shell.ts";
import type { RecordOptions } from "./types.ts";

export async function createSession(
  name: string,
  cols: number,
  rows: number,
  opts?: Pick<RecordOptions, "env" | "cwd" | "tmux" | "shell">,
): Promise<void> {
  const args = [
    "new-session",
    "-d",
    "-s",
    name,
    "-x",
    String(cols),
    "-y",
    String(rows),
  ];
  if (opts?.cwd) args.push("-c", opts.cwd);
  await tmux(...args);

  // Set default shell for new panes
  if (opts?.shell) {
    await tmux("set-option", "-t", name, "default-shell", opts.shell);
  }

  // Force 0-based indexing for predictable pane targeting
  await tmux("set-option", "-t", name, "base-index", "0");
  await tmux("set-option", "-t", name, "-w", "pane-base-index", "0");
  // Move window to index 0 if user config created it at a different index
  await tmux("move-window", "-s", `${name}:1`, "-t", `${name}:0`).catch(
    () => {},
  );
  // Disable status bar so it doesn't eat a row or cause line-wrap issues
  await tmux("set-option", "-t", name, "status", "off");

  if (opts?.tmux?.options) {
    for (const [key, value] of Object.entries(opts.tmux.options)) {
      await tmux("set-option", "-t", name, key, value);
    }
  }

  if (opts?.env) {
    for (const [key, value] of Object.entries(opts.env)) {
      await tmux("set-environment", "-t", name, key, value);
    }
  }
}

export async function killSession(name: string): Promise<void> {
  try {
    await tmux("kill-session", "-t", name);
  } catch {
    // Ignore errors — session may already be dead
  }
}

export async function splitPane(
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
  return tmux(...args);
}

export async function listPanes(session: string): Promise<string[]> {
  const out = await tmux("list-panes", "-t", session, "-F", "#{pane_index}");
  return out.split("\n").filter(Boolean);
}

export async function setOption(
  session: string,
  key: string,
  value: string,
): Promise<void> {
  await tmux("set-option", "-t", session, key, value);
}
