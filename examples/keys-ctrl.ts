/**
 * Demonstrates key() and ctrl() for special key input.
 * Shows navigating command history with arrows and cancelling with Ctrl+C.
 */
import { ctrl, record } from "../src/index.ts";

await record(
  "bin/demo-keys.cast",
  { cols: 100, rows: 30, idleTimeLimit: 2 },
  (s) => {
    s.sleep(500);

    // Type some commands to build history
    s.typeHuman("echo 'first command'").enter();
    s.sleep(500);
    s.typeHuman("echo 'second command'").enter();
    s.sleep(500);

    // Use arrow keys to navigate history
    s.key("Up");
    s.sleep(400);
    s.key("Up");
    s.sleep(400);
    s.key("Down");
    s.sleep(400);
    s.enter();
    s.sleep(500);

    // Type something then cancel with Ctrl+C
    s.typeHuman("this-will-be-cancelled");
    s.sleep(600);
    s.type(ctrl("c"));
    s.sleep(500);

    s.typeHuman("echo 'Ctrl+C worked, back to clean prompt'").enter();
    s.sleep(1000);
  },
);

console.log("Recording saved to bin/demo-keys.cast");
console.log("Play with: asciinema play bin/demo-keys.cast");
