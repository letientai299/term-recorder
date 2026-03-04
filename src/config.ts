/**
 * Shared configuration for all recordings in a script.
 * Passed to {@link main} and merged with CLI flags (CLI takes precedence).
 */
export interface Config {
  /**
   * `"headful"` opens a visible tmux window (good for debugging scripts).
   * `"headless"` runs detached and logs actions to stdout.
   * Default: `"headful"`. Overridden by `--headless` CLI flag.
   */
  mode?: "headful" | "headless";
  /** Shell to launch inside tmux panes. Default: inherited from `$SHELL`. */
  shell?: string;
  /** Per-character delay for {@link Pane.type} in ms. Default: 100 (~120 WPM). */
  typingDelay?: number;
  /** Automatic pause inserted between every action in ms. Default: 300. Set to 0 to disable. */
  actionDelay?: number;
  /** Load the user's `tmux.conf`. Default: false (clean tmux with no user config). */
  loadTmuxConf?: boolean;
  /** Load the user's asciinema config. Default: false. */
  loadAsciinemaConf?: boolean;
  /** Directory for `.cast` output files. Default: `"./casts"`. Overridden by `-o` CLI flag. */
  outputDir?: string;
  /** Extra tmux options applied via `set-option` after session creation. */
  tmux?: { options?: Record<string, string> };
  /** Environment variables set in the tmux session via `set-environment`. */
  env?: Record<string, string>;
  /** Working directory for the tmux session. */
  cwd?: string;
}

/** Identity function for type inference on config objects. */
export function defineConfig(config: Config): Config {
  return config;
}
