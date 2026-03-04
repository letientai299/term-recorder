/**
 * Demonstrates key() and ctrl() for special key input.
 * Shows navigating command history with arrows and cancelling with Ctrl+C.
 */
import { ctrl, record } from "../src/index.ts";

await record(
  "bin/demo-keys.cast",
  { cols: 100, rows: 30, idleTimeLimit: 2 },
  (s) => {
    // Type some commands to build history
    s.typeHuman("echo 'first command'").enter();
    s.typeHuman("echo 'second command'").enter();

    // Use arrow keys to navigate history
    s.key("Up").key("Up").key("Down").enter();

    // Type something then cancel with Ctrl+C
    s.typeHuman("this-will-be-cancelled");
    s.type(ctrl("c"));

    s.typeHuman("echo 'Ctrl+C worked, back to clean prompt'").enter();
  },
);

console.log("Recording saved to bin/demo-keys.cast");
console.log("Play with: asciinema play bin/demo-keys.cast");
