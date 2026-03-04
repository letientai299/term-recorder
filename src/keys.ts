/**
 * Map of user-facing key names to tmux key names. Used by {@link Pane.key}.
 * Sent via `send-keys` without `-l` — tmux translates named keys to the
 * appropriate escape sequences for the pane's terminal.
 */
export const KEYS: Record<string, string> = {
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
