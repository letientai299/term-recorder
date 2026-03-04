/** Map of named keys to their terminal escape sequences. Used by {@link Pane.key}. */
export const KEYS: Record<string, string> = {
  Escape: "\x1b",
  Enter: "\r",
  Tab: "\t",
  Backspace: "\x7f",
  Space: " ",
  Up: "\x1b[A",
  Down: "\x1b[B",
  Right: "\x1b[C",
  Left: "\x1b[D",
  Home: "\x1b[H",
  End: "\x1b[F",
  Insert: "\x1b[2~",
  Delete: "\x1b[3~",
  PageUp: "\x1b[5~",
  PageDown: "\x1b[6~",
  F1: "\x1bOP",
  F2: "\x1bOQ",
  F3: "\x1bOR",
  F4: "\x1bOS",
  F5: "\x1b[15~",
  F6: "\x1b[17~",
  F7: "\x1b[18~",
  F8: "\x1b[19~",
  F9: "\x1b[20~",
  F10: "\x1b[21~",
  F11: "\x1b[23~",
  F12: "\x1b[24~",
};

/**
 * Produce a Ctrl+key escape sequence from a single character.
 * Pass the result to {@link Pane.send} (not `type` — control sequences
 * should be sent instantly).
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
