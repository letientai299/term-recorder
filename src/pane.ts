import { KEYS } from "./keys.ts";
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
 * Send a named key using tmux key names (e.g. "Enter", "Up", "BSpace").
 * Keys are sent without `-l` so tmux translates them to the appropriate
 * escape sequences for the pane's terminal.
 */
export async function sendKey(
  server: TmuxServer,
  target: string,
  keyName: string,
): Promise<void> {
  const tmuxName = KEYS[keyName];
  if (!tmuxName)
    throw new Error(
      `Unknown key: "${keyName}". Available: ${Object.keys(KEYS).join(", ")}`,
    );
  await server.tmux("send-keys", "-t", target, tmuxName);
}

/**
 * Capture the full pane content as plain text.
 */
export async function capturePane(
  server: TmuxServer,
  target: string,
): Promise<string> {
  return server.tmux("capture-pane", "-t", target, "-p", "-T", "-S", "-");
}

/**
 * Get the pane title set by the running program via ANSI escape sequences.
 */
export async function getPaneTitle(
  server: TmuxServer,
  target: string,
): Promise<string> {
  return server.tmux(
    "display-message",
    "-t",
    target,
    "-p",
    "#{pane_title}",
  );
}
