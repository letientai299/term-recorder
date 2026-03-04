import { capturePane, getPaneTitle, sendKeys } from "./pane.ts";
import type { TmuxServer } from "./shell.ts";

const DEFAULT_TIMEOUT = 5_000;
const POLL_INTERVAL = 50;

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

let subscriptionCounter = 0;

/**
 * Wait until the pane title contains `title`, using tmux 3.1+
 * `refresh-client -B` subscriptions for push-based notification.
 */
export async function waitForTitle(
  server: TmuxServer,
  target: string,
  title: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> {
  const name = `tr-title-${process.pid}-${++subscriptionCounter}`;

  // Check current title first — may already match
  const current = await getPaneTitle(server, target);
  if (current.includes(title)) return;

  await server.subscribe(name, target, "#{pane_title}");
  try {
    await server.waitForSubscription(
      name,
      (v) => v.includes(title),
      timeout,
    );
  } catch (err) {
    throw new Error(
      `waitForTitle("${title}") timed out after ${timeout}ms on ${target}`,
    );
  } finally {
    await server.unsubscribe(name);
  }
}

/**
 * Detect the prompt string by sending a random marker and inspecting where it lands.
 * Types the marker (no Enter), captures the pane to find the prompt prefix,
 * then erases the marker with backspaces.
 */
export async function detectPrompt(
  server: TmuxServer,
  target: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<string> {
  await Bun.sleep(POLL_INTERVAL);
  const marker = `__tr_probe_${crypto.randomUUID().slice(0, 8)}__`;

  await sendKeys(server, target, marker);
  await waitForText(server, target, marker, timeout);

  const content = await capturePane(server, target);

  // Erase the marker with backspaces
  for (let i = 0; i < marker.length; i++) {
    await server.tmux("send-keys", "-t", target, "BSpace");
  }

  for (const line of content.split("\n")) {
    const idx = line.indexOf(marker);
    // Trim trailing whitespace — capture-pane strips it from lines,
    // so a prompt like ">>> " would never match the captured last line.
    if (idx >= 0) return line.slice(0, idx).trimEnd();
  }

  throw new Error(`detectPrompt: marker not found in pane content`);
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
          new Error(`exec("${cmd}") timed out after ${timeout}ms on ${target}`),
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
