/**
 * Demonstrates exec() (wait for command to finish) and waitForText().
 * exec() uses tmux wait-for under the hood — no polling, no guessing.
 */
import { record } from "../src/index.ts";

await record(
  "bin/demo-exec-wait.cast",
  { cols: 100, rows: 30, idleTimeLimit: 2 },
  (s) => {
    // exec() waits for the command to complete before continuing
    s.typeHuman("echo 'Running a slow command...'").enter();
    s.exec("sleep 2 && echo 'DONE: slow command finished'");

    // waitForText() polls capture-pane until the text appears
    s.typeHuman("echo 'Now using waitForText...'").enter();
    s.typeHuman("(sleep 1 && echo MARKER_READY) &").enter();
    s.waitForText("MARKER_READY", 5000);

    s.typeHuman("echo 'Detected MARKER_READY — continuing.'").enter();
  },
);

console.log("Recording saved to bin/demo-exec-wait.cast");
console.log("Play with: asciinema play bin/demo-exec-wait.cast");
