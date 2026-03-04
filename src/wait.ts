import { capturePane, getPaneTitle, sendKeys } from "./pane.ts";
import type { TmuxServer } from "./shell.ts";

const DEFAULT_TIMEOUT = 5_000;

/** Slow fallback interval when no %output hint arrives. */
const FALLBACK_POLL_MS = 500;

/**
 * Wait for `%output` or a timeout — whichever comes first.
 * Returns immediately when the server emits an output notification,
 * allowing the caller to re-check a predicate without blind polling.
 */
function waitForOutputHint(server: TmuxServer, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      server.offOutput(cb);
      resolve();
    }, ms);
    const cb = () => {
      clearTimeout(timer);
      server.offOutput(cb);
      resolve();
    };
    server.onOutput(cb);
  });
}

/**
 * Wait until no `%output` arrives within the given silence window.
 * Resolves immediately if the server is not in control mode (no %output support).
 */
function waitForOutputSilence(server: TmuxServer, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let timer = setTimeout(done, ms);
    const cb = () => {
      clearTimeout(timer);
      timer = setTimeout(done, ms);
    };
    function done() {
      server.offOutput(cb);
      resolve();
    }
    server.onOutput(cb);
  });
}

/**
 * Generic pane poller — fetches data until `predicate` returns true.
 * By default fetches via `capture-pane`; pass `opts.fetch` to override.
 *
 * When the server is in control mode, uses `%output` notifications as
 * hints to re-check immediately instead of blind polling. Falls back
 * to {@link FALLBACK_POLL_MS} between checks when no output arrives.
 *
 * Set `suppressErrors` to swallow fetch failures (e.g. pane not yet created).
 */
export async function pollPane(
  server: TmuxServer,
  target: string,
  predicate: (content: string) => boolean,
  timeout: number,
  label: string,
  opts?: { suppressErrors?: boolean; fetch?: () => Promise<string> },
): Promise<void> {
  const getData = opts?.fetch ?? (() => capturePane(server, target));
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const content = await getData();
      if (predicate(content)) return;
    } catch (err) {
      if (!opts?.suppressErrors) throw err;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await waitForOutputHint(server, Math.min(FALLBACK_POLL_MS, remaining));
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
    await server.waitForSubscription(name, (v) => v.includes(title), timeout);
  } catch (_err) {
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
  await waitForOutputSilence(server, FALLBACK_POLL_MS);
  const marker = `__tr_probe_${crypto.randomUUID().slice(0, 8)}__`;

  await sendKeys(server, target, marker);
  await waitForText(server, target, marker, timeout);

  const content = await capturePane(server, target);

  // Erase the marker with backspaces
  for (const _ of marker) {
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
