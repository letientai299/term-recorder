import type { SessionApi } from "./types.ts";

export interface Recording {
  name: string;
  script: (s: SessionApi) => void | Promise<void>;
}

/** Only allow safe characters: alphanumeric, dots, hyphens, underscores, slashes. */
const VALID_NAME = /^[a-zA-Z0-9._\-/]+$/;

/**
 * Create a lazy recording descriptor.
 * Does not execute anything — pass to `main()` for orchestrated execution.
 */
export function record(
  name: string,
  script: (s: SessionApi) => void | Promise<void>,
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
