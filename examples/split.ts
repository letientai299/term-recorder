import { record } from "../src/index.ts";

await record(
  "bin/demo-split.cast",
  { cols: 120, rows: 35, idleTimeLimit: 2 },
  (s) => {
    s.typeHuman("echo 'Left pane'").enter();

    const right = s.splitH(50);

    right.typeHuman("echo 'Right pane'").enter();

    s.typeHuman("echo 'Both panes visible!'").enter();

    right.typeHuman("ls").enter();
  },
);

console.log("Recording saved to bin/demo-split.cast");
console.log("Play with: asciinema play bin/demo-split.cast");
