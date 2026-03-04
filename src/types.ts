/** 120 WPM × 5 chars/word ÷ 60s = 10 chars/s → 100ms per char */
export const DEFAULT_TYPING_DELAY_MS = 100;

/** Auto-pause between actions (ms). 0 = no pause. */
export const DEFAULT_ACTION_DELAY_MS = 300;

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
  /** Per-char delay for {@link Pane.type} in ms. Default: 100 (~120 WPM). */
  typingDelay?: number;
  /** Auto-pause between actions in ms. Negative values become 0. Default: 300. */
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
}

/** Single source of truth for every action kind and its payload (excluding `kind` itself). */
export interface ActionDefs {
  send: { pane: string; text: string };
  type: { pane: string; text: string; delayMs?: number };
  key: { pane: string; name: string };
  enter: { pane: string };
  exec: { pane: string; cmd: string; timeout?: number };
  sleep: { ms: number };
  waitForText: { pane: string; text: string; timeout?: number };
  waitForPrompt: { pane: string; prompt: string; timeout?: number };
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
   */
  key(name: string): Pane;
  /** Press Enter. Shorthand for `.key("Enter")`. */
  enter(): Pane;
  /**
   * Run a shell command and block until the prompt returns.
   * Internally wraps the command in a subshell with an EXIT trap that signals
   * tmux `wait-for`, so pipes, semicolons, and compound commands all work.
   * @param cmd - Shell command to execute.
   * @param timeout - Max wait time in ms. Default: 10 000.
   */
  exec(cmd: string, timeout?: number): Pane;
  /** Pause for a fixed duration. Does not add an extra {@link Config.actionDelay} after itself. */
  sleep(ms: number): Pane;
  /**
   * Block until `text` appears anywhere in the pane content.
   * Polls every 200ms via `capture-pane`.
   * @param text - Substring to search for.
   * @param timeout - Max wait time in ms. Default: 10 000.
   */
  waitForText(text: string, timeout?: number): Pane;
  /**
   * Block until the last non-empty line in the pane contains `prompt`.
   * Useful for waiting until a shell or REPL is ready for input.
   * @param prompt - Substring to match on the last line (e.g. `"$"`, `">>>"`, `"%"`).
   * @param timeout - Max wait time in ms. Default: 10 000.
   */
  waitForPrompt(prompt: string, timeout?: number): Pane;
}

/**
 * The main pane of a tmux session. Extends {@link Pane} with methods to
 * create additional panes via splits. Passed to the {@link record} callback.
 */
export interface Session extends Pane {
  sleep(ms: number): Session;
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
