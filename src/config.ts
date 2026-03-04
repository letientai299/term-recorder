import type { RecordOptions } from "./types.ts";

/**
 * Shared configuration for all recordings in a script.
 * Passed to {@link main} and merged with CLI flags (CLI takes precedence).
 *
 * Extends {@link RecordOptions} (minus `sessionName`, which is auto-generated)
 * and adds script-level settings like `outputDir`.
 */
export interface Config extends Omit<RecordOptions, "sessionName"> {
  /** Directory for `.cast` output files. Default: `"./casts"`. Overridden by `-o` CLI flag. */
  outputDir?: string;
}

/** Identity function for type inference on config objects. */
export function defineConfig(config: Config): Config {
  return config;
}
