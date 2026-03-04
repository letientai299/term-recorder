/** 160 WPM × 5 chars/word ÷ 60s = 10 chars/s → 75ms per char */
export const DEFAULT_TYPING_DELAY_MS = 75;

/** Auto-pause between actions (ms). 0 = no pause. */
export const DEFAULT_ACTION_DELAY_MS = 200;

/** Idle time before ending recording so the last frame stays visible. */
export const DEFAULT_TRAILING_DELAY_MS = 1000;

/**
 * Low-level options for {@link executeRecording}.
 * Most users should use {@link Config} with {@link main} instead — `main()` resolves
 * CLI flags into `RecordOptions` automatically.
 */
export interface RecordOptions {
  /** `"headful"` shows tmux in a terminal; `"headless"` runs detached with logs. Default: `"headful"`. */
  mode?: "headful" | "headless";
  /** Shell to launch inside tmux panes. Default: inherited from `$SHELL`. */
  shell?: string;
  /** Per-char delay for {@link Pane.type} in ms. Default: {@link DEFAULT_TYPING_DELAY_MS}  */
  typingDelay?: number;
  /** Auto-pause between actions in ms. Negative values become 0. Default: {@link DEFAULT_ACTION_DELAY_MS}. */
  actionDelay?: number;
  /** Load user's `tmux.conf`. Default: false (clean tmux with no user config). */
  loadTmuxConf?: boolean;
  /** Load user's asciinema config. Default: false. */
  loadAsciinemaConf?: boolean;
  /** Extra tmux options applied via `set-option`. */
  tmux?: { options?: Record<string, string> };
  /** Environment variables set in the tmux session. */
  env?: Record<string, string>;
  /** Working directory for the tmux session. */
  cwd?: string;
  /** Override the tmux session name. Default: auto-generated from timestamp. */
  sessionName?: string;
  /** Extra idle time (ms) before ending the recording, so the last frame stays visible on playback. Default: 1000. Set to 0 to disable. */
  trailingDelay?: number;
}

import type { Key } from "./keys.ts";

/** Single source of truth for every action kind and its payload (excluding `kind` itself). */
export interface ActionDefs {
  send: { pane: string; text: string };
  type: { pane: string; text: string; delayMs?: number };
  key: { pane: string; name: Key };
  enter: { pane: string };
  exec: { pane: string; cmd: string; timeout?: number };
  sleep: { ms: number };
  waitForText: { pane: string; text: string; timeout?: number };
  waitForPrompt: { pane: string; prompt?: string; timeout?: number };
  detectPrompt: { pane: string; timeout?: number };
  waitForTitle: { pane: string; title: string; timeout?: number };
  splitH: { session: string; percent?: number; placeholder?: string };
  splitV: { session: string; percent?: number; placeholder?: string };
}

/** Union of all valid `kind` strings. */
export type ActionKind = keyof ActionDefs;

/** Tagged union derived from {@link ActionDefs}. */
export type Action = {
  [K in ActionKind]: { kind: K } & ActionDefs[K];
}[ActionKind];

/** Narrow {@link Action} to a specific kind. */
export type ActionOf<K extends ActionKind> = Extract<Action, { kind: K }>;

/**
 * Actions available on a single tmux pane. All methods are chainable
 * and queue actions for later execution — nothing runs until {@link main}
 * drains the queue.
 */
export interface Pane {
  /** Send literal text instantly (no per-character delay). Useful for control sequences like `ctrl("c")`. */
  send(text: string): Pane;
  /**
   * Type text with a per-character delay to simulate human typing.
   * @param text - Text to type.
   * @param delayMs - Override the per-char delay (ms). Default: {@link Config.typingDelay} or 100.
   */
  type(text: string, delayMs?: number): Pane;
  /**
   * Send a named key. Available names: `Escape`, `Enter`, `Tab`, `Backspace`, `Space`,
   * `Up`, `Down`, `Left`, `Right`, `Home`, `End`, `Insert`, `Delete`,
   * `PageUp`, `PageDown`, `F1`–`F12`.
   *
   * Modifier combos are also supported: `"ctrl-c"`, `"alt-x"`, `"shift-Tab"`.
   */
  key(name: Key): Pane;
  /** Press Enter. Shorthand for `.key("Enter")`. */
  enter(): Pane;
  /**
   * Run a shell command and block until the prompt returns.
   * Internally wraps the command in a subshell with an EXIT trap that signals
   * tmux `wait-for`, so pipes, semicolons, and compound commands all work.
   * @param cmd - Shell command to execute.
   * @param timeout - Max wait time in ms. Default: 5 000.
   */
  exec(cmd: string, timeout?: number): Pane;
  /** Pause for a fixed duration. Does not add an extra {@link Config.actionDelay} after itself. */
  sleep(ms: number): Pane;
  /**
   * Block until `text` appears anywhere in the pane content.
   * Re-checks on `%output` notifications with a 500ms fallback poll.
   * @param text - Substring to search for.
   * @param timeout - Max wait time in ms. Default: 5 000.
   */
  waitForText(text: string, timeout?: number): Pane;
  /**
   * Block until the last non-empty line in the pane contains `prompt`.
   * Useful for waiting until a shell or REPL is ready for input.
   * When called with no prompt, uses the value from a prior {@link detectPrompt} call.
   * @param prompt - Substring to match on the last line (e.g. `"$"`, `">>>"`, `"%"`).
   * @param timeout - Max wait time in ms. Default: 5 000.
   */
  waitForPrompt(prompt?: string, timeout?: number): Pane;
  /**
   * Detect the prompt string of the current shell or REPL. Types a random marker,
   * captures the pane to find the text preceding it (the prompt), then erases the marker.
   * The detected prompt is stored and used by subsequent {@link waitForPrompt} calls with no argument.
   * @param timeout - Max wait time in ms. Default: 5 000.
   */
  detectPrompt(timeout?: number): Pane;
  /**
   * Block until the tmux pane title contains `title`.
   * Uses tmux `refresh-client -B` subscriptions for push-based notification.
   * Useful for programs that set the terminal title (e.g. Claude Code).
   * @param title - Substring to match in the pane title.
   * @param timeout - Max wait time in ms. Default: 5 000.
   */
  waitForTitle(title: string, timeout?: number): Pane;
  /** Type text and press Enter. Shorthand for `.type(text).enter()`. */
  run(text: string): Pane;
  /** Type text, press Enter, then wait for the detected prompt to reappear. Requires a prior `detectPrompt()`. */
  reply(text: string, timeout?: number): Pane;
  /** Pause for a fixed duration. Like {@link sleep} but defaults to 1 000 ms. */
  pause(ms?: number): Pane;
}

/**
 * The main pane of a tmux session. Extends {@link Pane} with methods to
 * create additional panes via splits. Passed to the {@link record} callback.
 */
export interface Session extends Pane {
  sleep(ms: number): Session;
  run(text: string): Session;
  reply(text: string, timeout?: number): Session;
  pause(ms?: number): Session;
  /**
   * Split the session horizontally (side by side). Returns a {@link Pane}
   * targeting the new right pane.
   * @param percent - Width of the new pane as a percentage. Omit for tmux default (50%).
   */
  splitH(percent?: number): Pane;
  /**
   * Split the session vertically (top/bottom). Returns a {@link Pane}
   * targeting the new bottom pane.
   * @param percent - Height of the new pane as a percentage. Omit for tmux default (50%).
   */
  splitV(percent?: number): Pane;
}
