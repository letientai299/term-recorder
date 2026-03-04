/** Named keys accepted by {@link Pane.key}. */
export type KeyName =
  | "Escape"
  | "Enter"
  | "Tab"
  | "Backspace"
  | "Space"
  | "Up"
  | "Down"
  | "Left"
  | "Right"
  | "Home"
  | "End"
  | "Insert"
  | "Delete"
  | "PageUp"
  | "PageDown"
  | "F1"
  | "F2"
  | "F3"
  | "F4"
  | "F5"
  | "F6"
  | "F7"
  | "F8"
  | "F9"
  | "F10"
  | "F11"
  | "F12";

/** Lowercase ASCII letter. */
export type Letter =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";

/** A key with a modifier prefix: `ctrl-c`, `alt-x`, `cmd-n`, `opt-x`, `shift-Tab`. */
export type ModifiedKey =
  | `ctrl-${Letter | KeyName}`
  | `alt-${Letter | KeyName}`
  | `cmd-${Letter | KeyName}`
  | `opt-${Letter | KeyName}`
  | `shift-${KeyName}`;

/**
 * All valid key values for {@link Pane.key}.
 * Includes plain named keys and modifier combos like `"ctrl-c"`, `"alt-x"`,
 * `"cmd-n"`, or `"opt-x"`. `cmd-` and `opt-` are macOS aliases for `alt-` (Meta).
 */
export type Key = KeyName | ModifiedKey;

/**
 * Map of user-facing key names to tmux key names. Used by {@link Pane.key}.
 * Sent via `send-keys` without `-l` — tmux translates named keys to the
 * appropriate escape sequences for the pane's terminal.
 */
export const KEYS = {
  Escape: "Escape",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "BSpace",
  Space: "Space",
  Up: "Up",
  Down: "Down",
  Right: "Right",
  Left: "Left",
  Home: "Home",
  End: "End",
  Insert: "Insert",
  Delete: "DC",
  PageUp: "PageUp",
  PageDown: "PageDown",
  F1: "F1",
  F2: "F2",
  F3: "F3",
  F4: "F4",
  F5: "F5",
  F6: "F6",
  F7: "F7",
  F8: "F8",
  F9: "F9",
  F10: "F10",
  F11: "F11",
  F12: "F12",
} as const satisfies Record<KeyName, string>;

/** Modifier prefixes mapped to tmux modifier syntax. `cmd` and `opt` are macOS aliases for `alt` (Meta). */
const MODIFIERS = {
  ctrl: "C-",
  alt: "M-",
  cmd: "M-",
  opt: "M-",
  shift: "S-",
} as const satisfies Record<"ctrl" | "alt" | "cmd" | "opt" | "shift", string>;

/**
 * Resolve a {@link Key} string to the tmux `send-keys` argument.
 *
 * - `"Up"` → `"Up"` (plain KEYS lookup)
 * - `"ctrl-c"` → `"C-c"` (tmux modifier prefix + letter)
 * - `"ctrl-Up"` → `"C-Up"` (tmux modifier prefix + KEYS lookup)
 * - `"alt-x"` → `"M-x"`
 * - `"cmd-n"` → `"M-n"` (macOS alias for alt/Meta)
 * - `"opt-x"` → `"M-x"` (macOS alias for alt/Meta)
 * - `"shift-Tab"` → `"S-Tab"` (S- + KEYS lookup)
 */
export function resolveKey(key: Key): string {
  // Plain named key — direct lookup
  if (key in KEYS) return KEYS[key as KeyName];

  const dash = key.indexOf("-");
  const modifier = key.slice(0, dash);
  const rest = key.slice(dash + 1);
  const prefix = MODIFIERS[modifier as keyof typeof MODIFIERS];
  if (!prefix) throw new Error(`Unknown modifier in key: "${key}"`);

  // shift only works with named keys (tmux has no keycode for shift+letter)
  if (modifier === "shift" && !(rest in KEYS)) {
    throw new Error(
      `shift modifier requires a named key (e.g. "shift-Tab"), not "${rest}"`,
    );
  }

  // rest is either a KeyName or a single letter
  if (rest in KEYS) return `${prefix}${KEYS[rest as KeyName]}`;
  return `${prefix}${rest}`;
}

/**
 * Produce a Ctrl+key escape sequence from a single character.
 * Pass the result to {@link Pane.send} (not `type` — control sequences
 * should be sent instantly).
 *
 * For key actions, prefer `key("ctrl-c")` over `send(ctrl("c"))`.
 *
 * @example
 * ```ts
 * s.send(ctrl("c")); // Ctrl+C — interrupt
 * s.send(ctrl("a")); // Ctrl+A — tmux prefix or beginning of line
 * s.send(ctrl("l")); // Ctrl+L — clear screen
 * ```
 *
 * Accepts `A`–`Z` (case-insensitive) and `@[\]^_`.
 */
export function ctrl(char: string): string {
  if (char.length !== 1)
    throw new Error(`ctrl() expects a single character, got "${char}"`);
  const upper = char.toUpperCase();
  const code = upper.charCodeAt(0);
  if (code < 0x40 || code > 0x5f) {
    throw new Error(`ctrl() expects A-Z or @[\\]^_, got "${char}"`);
  }
  return String.fromCharCode(code & 0x1f);
}
