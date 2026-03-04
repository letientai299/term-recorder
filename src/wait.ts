import { capturePane } from "./pane.ts";
import { tmux } from "./shell.ts";

const DEFAULT_TIMEOUT = 10_000;
const POLL_INTERVAL = 200;

/**
 * Poll capture-pane until `text` appears in the pane content.
 */
export async function waitForText(
  target: string,
  text: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const content = await capturePane(target);
    if (content.includes(text)) return;
    await Bun.sleep(POLL_INTERVAL);
  }
  throw new Error(
    `waitForText("${text}") timed out after ${timeout}ms on ${target}`,
  );
}

/**
 * Poll capture-pane until the last non-empty line matches the prompt pattern.
 */
export async function waitForPrompt(
  target: string,
  prompt: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const content = await capturePane(target);
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    const last = lines.at(-1) ?? "";
    if (last.includes(prompt)) return;
    await Bun.sleep(POLL_INTERVAL);
  }
  throw new Error(
    `waitForPrompt("${prompt}") timed out after ${timeout}ms on ${target}`,
  );
}

let channelCounter = 0;

/**
 * Execute a shell command and wait for it to finish using tmux wait-for.
 * Injects a `tmux wait-for -S <channel>` signal after the command.
 */
export async function exec(
  target: string,
  cmd: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> {
  const channel = `tr-done-${process.pid}-${++channelCounter}`;
  // Send the command followed by the signal
  await tmux(
    "send-keys",
    "-t",
    target,
    `${cmd} ; tmux wait-for -S ${channel}`,
    "Enter",
  );

  // Wait for the signal with a timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    await tmux("wait-for", channel);
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(
        `exec("${cmd}") timed out after ${timeout}ms on ${target}`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
