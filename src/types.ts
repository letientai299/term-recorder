/** 120 WPM × 5 chars/word ÷ 60s = 10 chars/s → 100ms per char */
export const DEFAULT_TYPING_DELAY_MS = 100;

/** Auto-pause between actions (ms). 0 = no pause. */
export const DEFAULT_ACTION_DELAY_MS = 300;

export interface RecordOptions {
  cols?: number;
  rows?: number;
  idleTimeLimit?: number;
  /** "headful" (default) shows tmux in a terminal; "headless" runs detached with logs. */
  mode?: "headful" | "headless";
  /** Shell to launch inside tmux panes. Default: inherited from $SHELL. */
  shell?: string;
  /** Per-char delay for typeHuman() in ms. Default: 100 (120 WPM). */
  typingDelay?: number;
  /** Auto-pause between actions in ms. Negative values become 0. Default: 300. */
  actionDelay?: number;
  /** Load user's tmux.conf. Default: false (clean tmux with no user config). */
  userTmuxConf?: boolean;
  /** Load user's asciinema config. Default: false (clean asciinema config). */
  userAsciinemaConf?: boolean;
  tmux?: { options?: Record<string, string> };
  env?: Record<string, string>;
  cwd?: string;
  sessionName?: string;
}

export type Action =
  | { kind: "type"; pane: string; text: string }
  | { kind: "typeHuman"; pane: string; text: string; delayMs?: number }
  | { kind: "key"; pane: string; name: string }
  | { kind: "enter"; pane: string }
  | { kind: "exec"; pane: string; cmd: string; timeout?: number }
  | { kind: "sleep"; ms: number }
  | { kind: "waitForText"; pane: string; text: string; timeout?: number }
  | { kind: "waitForPrompt"; pane: string; prompt: string; timeout?: number }
  | { kind: "splitH"; session: string; percent?: number; placeholder?: string }
  | { kind: "splitV"; session: string; percent?: number; placeholder?: string };

export interface PaneApi {
  type(text: string): PaneApi;
  typeHuman(text: string, delayMs?: number): PaneApi;
  key(name: string): PaneApi;
  enter(): PaneApi;
  exec(cmd: string, timeout?: number): PaneApi;
  sleep(ms: number): PaneApi;
  waitForText(text: string, timeout?: number): PaneApi;
  waitForPrompt(prompt: string, timeout?: number): PaneApi;
}

export interface SessionApi extends PaneApi {
  sleep(ms: number): SessionApi;
  splitH(percent?: number): PaneApi;
  splitV(percent?: number): PaneApi;
}
