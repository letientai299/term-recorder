import { capturePane, getPaneId, getPaneTitle, sendKeys } from "./pane.ts";
import type { TmuxServer } from "./shell.ts";

const DEFAULT_TIMEOUT = 5_000;

/** Slow fallback interval when no %output hint arrives. */
const FALLBACK_POLL_MS = 500;

/** Debounce window — collapses rapid %output bursts into one wakeup. */
const OUTPUT_DEBOUNCE_MS = 15;

/**
 * Wait for `%output` or a timeout — whichever comes first.
 * Debounces rapid output bursts so the caller doesn't issue a
 * capture-pane RPC for every notification during heavy output.
 *
 * When `paneId` is provided, only output on that specific pane triggers
 * a wakeup — prevents spurious checks in multi-pane recordings.
 */
function waitForOutputHint(
  server: TmuxServer,
  ms: number,
  paneId?: string,
): Promise<void> {
  return new Promise<void>((resolve) => {
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const fallback = setTimeout(done, ms);
    const cb = (id: string) => {
      if (paneId && id !== paneId) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(done, OUTPUT_DEBOUNCE_MS);
    };
    function done() {
      clearTimeout(fallback);
      if (debounce) clearTimeout(debounce);
      server.offOutput(cb);
      resolve();
    }
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
  // Resolve pane ID once for filtered %output listening
  let paneId: string | undefined;
  try {
    paneId = await getPaneId(server, target);
  } catch {
    // Fall back to unfiltered if pane ID resolution fails
  }
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
    await waitForOutputHint(
      server,
      Math.min(FALLBACK_POLL_MS, remaining),
      paneId,
    );
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
  timeout: number = DEFAULT_TIMEOUT,
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
  timeout: number = DEFAULT_TIMEOUT,
): Promise<void> {
  return pollPane(
    server,
    target,
    (content) => {
      // Reverse scan for last non-empty line — avoids split + filter allocation.
      let end = content.length;
      for (;;) {
        // Trim trailing whitespace/newlines
        while (end > 0 && content.charCodeAt(end - 1) <= 32) end--;
        if (end === 0) return false;
        const start = (content.lastIndexOf("\n", end - 1) + 1) | 0;
        const line = content.slice(start, end);
        if (line.trim().length > 0) return line.includes(prompt);
        end = start > 0 ? start - 1 : 0;
      }
    },
    timeout,
    `waitForPrompt("${prompt}")`,
  );
}

/**
 * Wait until the pane becomes idle: detects a command change or output,
 * then waits for output silence ({@link FALLBACK_POLL_MS}).
 */
export async function waitForIdle(
  server: TmuxServer,
  target: string,
  timeout = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeout;

  // Phase 1: wait for any change (output or command change).
  // Use a subscription for push-based command-change detection instead of
  // polling display-message every iteration.
  const subName = `tr-idle-${process.pid}-${++subscriptionCounter}`;
  await server.subscribe(subName, target, "#{pane_current_command}");

  let changed = false;
  try {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`waitForIdle timed out after ${timeout}ms on ${target}`);
    }

    // Race: subscription fires on command change, output hint fires on output
    await Promise.race([
      server
        .waitForSubscription(subName, () => true, remaining)
        .then(() => {
          changed = true;
        }),
      waitForOutputHint(server, remaining).then(() => {
        changed = true;
      }),
    ]);
  } finally {
    await server.unsubscribe(subName);
  }

  if (!changed) {
    throw new Error(`waitForIdle timed out after ${timeout}ms on ${target}`);
  }

  // Phase 2: wait for output silence
  const silenceRemaining = Math.max(
    0,
    Math.min(FALLBACK_POLL_MS, deadline - Date.now()),
  );
  if (silenceRemaining > 0) {
    await waitForOutputSilence(server, silenceRemaining);
  }
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
  timeout: number = DEFAULT_TIMEOUT,
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
  timeout: number = DEFAULT_TIMEOUT,
): Promise<string> {
  await waitForOutputSilence(server, FALLBACK_POLL_MS);
  const marker = `__tr_probe_${crypto.randomUUID().slice(0, 8)}__`;

  await sendKeys(server, target, marker);
  await waitForText(server, target, marker, timeout);

  const content = await capturePane(server, target);

  // Erase the marker — C-u kills the entire line in one command
  await server.tmux("send-keys", "-t", target, "C-u");

  for (const line of content.split("\n")) {
    const idx = line.indexOf(marker);
    // Trim trailing whitespace — capture-pane strips it from lines,
    // so a prompt like ">>> " would never match the captured last line.
    if (idx >= 0) return line.slice(0, idx).trimEnd();
  }

  throw new Error(`detectPrompt: marker not found in pane content`);
}
