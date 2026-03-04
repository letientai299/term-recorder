import type { Session } from "./types.ts";

/** A named recording descriptor. Created by {@link record}, executed by {@link main}. */
export interface Recording {
  /** Filename stem for the output `.cast` file. Also used as the tmux session suffix. */
  name: string;
  /** Script that queues actions on the session. Maybe sync or async. */
  script: (s: Session) => void | Promise<void>;
}

/** Only allow safe characters: alphanumeric, dots, hyphens, underscores, slashes. */
const VALID_NAME = /^[a-zA-Z0-9._\-/]+$/;

/**
 * Create a named recording. The script callback receives a {@link Session} and
 * queues actions declaratively — nothing executes until passed to {@link main}.
 *
 * Names must match `[a-zA-Z0-9._\-/]+` (no path traversal). Slashes create
 * subdirectories in the output folder (e.g. `"demos/hello"` → `casts/demos/hello.cast`).
 */
export function record(
  name: string,
  script: (s: Session) => void | Promise<void>,
): Recording {
  if (!name || !VALID_NAME.test(name)) {
    throw new Error(
      `Invalid recording name "${name}": only a-z, A-Z, 0-9, dot, hyphen, underscore, and slash are allowed`,
    );
  }
  if (name.includes("..")) {
    throw new Error(
      `Invalid recording name "${name}": path traversal ("..") is not allowed`,
    );
  }
  return { name, script };
}
