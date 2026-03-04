import { KEYS } from "./keys.ts";
import type { TmuxServer } from "./shell.ts";

/**
 * Send literal text to a tmux pane. Uses -l to prevent key interpretation.
 */
export async function sendKeys(
  server: TmuxServer,
  target: string,
  text: string,
  literal = true,
): Promise<void> {
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
