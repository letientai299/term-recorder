import type { Key } from "./keys.ts";
import { resolveKey } from "./keys.ts";
import type { TmuxServer } from "./shell.ts";

/**
 * Send literal text to a tmux pane. Uses -l to prevent key interpretation.
 * Newlines are sent as Enter keys since they can't be embedded in a single
 * tmux control mode command line.
 */
export async function sendKeys(
  server: TmuxServer,
  target: string,
  text: string,
  literal = true,
): Promise<void> {
  if (literal && text.includes("\n")) {
    // Split on newlines — send each chunk as literal, newlines as Enter
    const parts = text.split("\n");
    for (const [i, part] of parts.entries()) {
      if (part.length > 0) {
        await server.tmux("send-keys", "-t", target, "-l", part);
      }
      if (i < parts.length - 1) {
        await server.tmux("send-keys", "-t", target, "Enter");
      }
    }
    return;
  }
  const args = ["send-keys", "-t", target];
  if (literal) args.push("-l");
  args.push(text);
  await server.tmux(...args);
}

/**
 * Send a named key (with optional modifier) to a tmux pane.
 * Accepts any value from the {@link Key} type: plain names like `"Enter"`,
 * or modifier combos like `"ctrl-c"`, `"alt-x"`, `"shift-Tab"`.
 */
export async function sendKey(
  server: TmuxServer,
  target: string,
  key: Key,
): Promise<void> {
  const tmuxName = resolveKey(key);
  await server.tmux("send-keys", "-t", target, tmuxName);
}

/**
 * Capture recent pane content as plain text.
 *
 * Limits capture to the last 200 lines (visible area + some scrollback)
 * to avoid transferring the entire scrollback buffer through control mode
 * on every poll — important when commands produce massive output (e.g. AI agents).
 * If the pane has fewer lines, tmux returns whatever is available.
 */
export async function capturePane(
  server: TmuxServer,
  target: string,
): Promise<string> {
  return server.tmux("capture-pane", "-t", target, "-p", "-T", "-S", "-200");
}

/**
 * Get the pane title set by the running program via ANSI escape sequences.
 */
export async function getPaneTitle(
  server: TmuxServer,
  target: string,
): Promise<string> {
  return server.tmux("display-message", "-t", target, "-p", "#{pane_title}");
}
