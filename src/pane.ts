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
 * Send a named key (from the KEYS map) or raw escape sequence.
 */
export async function sendKey(
  server: TmuxServer,
  target: string,
  keyName: string,
): Promise<void> {
  const seq = KEYS[keyName];
  if (!seq)
    throw new Error(
      `Unknown key: "${keyName}". Available: ${Object.keys(KEYS).join(", ")}`,
    );
  // Escape sequences must be sent without -l so tmux interprets them
  await server.tmux("send-keys", "-t", target, seq);
}

/**
 * Capture the full pane content as plain text.
 */
export async function capturePane(
  server: TmuxServer,
  target: string,
): Promise<string> {
  return server.tmux("capture-pane", "-t", target, "-p", "-S", "-");
}
