import { capturePane } from "./pane.ts";
import type { TmuxServer } from "./shell.ts";

const DEFAULT_TIMEOUT = 10_000;
const POLL_INTERVAL = 100;

/**
 * Generic pane poller — captures pane content until `predicate` returns true.
 * Set `suppressErrors` to swallow capture failures (e.g. pane not yet created).
 */
export async function pollPane(
  server: TmuxServer,
  target: string,
  predicate: (content: string) => boolean,
  timeout: number,
  label: string,
  opts?: { suppressErrors?: boolean },
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const content = await capturePane(server, target);
      if (predicate(content)) return;
    } catch (err) {
      if (!opts?.suppressErrors) throw err;
    }
    await Bun.sleep(POLL_INTERVAL);
  }
  throw new Error(`${label} timed out after ${timeout}ms on ${target}`);
}

/**
 * Poll capture-pane until `text` appears in the pane content.
 */
export async function waitForText(
  server: TmuxServer,
  target: string,
  text: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> {
  return pollPane(
    server,
    target,
    (c) => c.includes(text),
    timeout,
    `waitForText("${text}")`,
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
  return pollPane(
    server,
    target,
    (content) => {
      const lines = content.split("\n").filter((l) => l.trim().length > 0);
      return (lines.at(-1) ?? "").includes(prompt);
    },
    timeout,
    `waitForPrompt("${prompt}")`,
  );
}

let channelCounter = 0;

/**
 * Execute a shell command and wait for it to finish using tmux wait-for.
 * Uses a subshell with EXIT trap so command content (}; etc.) can't break the signal.
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
    `(trap 'tmux wait-for -S ${channel}' EXIT; ${cmd})`,
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
