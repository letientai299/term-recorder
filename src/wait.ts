import { capturePane } from "./pane.ts";
import type { TmuxServer } from "./shell.ts";

const DEFAULT_TIMEOUT = 10_000;
const POLL_INTERVAL = 200;

/**
 * Poll capture-pane until `text` appears in the pane content.
 */
export async function waitForText(
  server: TmuxServer,
  target: string,
  text: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const content = await capturePane(server, target);
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
  server: TmuxServer,
  target: string,
  prompt: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const content = await capturePane(server, target);
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
 * Wraps the command in a brace group to avoid subshell paren-matching issues.
 */
export async function exec(
  server: TmuxServer,
  target: string,
  cmd: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> {
  const channel = `tr-done-${process.pid}-${++channelCounter}`;
  await server.tmux(
    "send-keys",
    "-t",
    target,
    `{ ${cmd}; }; tmux wait-for -S ${channel}`,
    "Enter",
  );

  // Race wait-for against a timeout — tmux wait-for blocks indefinitely
  const waitPromise = server.tmux("wait-for", channel);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `exec("${cmd}") timed out after ${timeout}ms on ${target}`,
          ),
        ),
      timeout,
    );
  });
  try {
    await Promise.race([waitPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
