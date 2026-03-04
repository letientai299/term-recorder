import { record } from "../src/index.ts";

await record(
  "bin/demo-split.cast",
  { cols: 120, rows: 35, idleTimeLimit: 2 },
  (s) => {
    s.sleep(500);
    s.typeHuman("echo 'Left pane'").enter();
    s.sleep(500);

    const right = s.splitH(50);
    s.sleep(500);

    right.typeHuman("echo 'Right pane'").enter();
    s.sleep(500);

    // Back to left pane
    s.typeHuman("echo 'Both panes visible!'").enter();
    s.sleep(1000);

    right.typeHuman("ls").enter();
    s.sleep(1500);
  },
);

console.log("Recording saved to bin/demo-split.cast");
console.log("Play with: asciinema play bin/demo-split.cast");
