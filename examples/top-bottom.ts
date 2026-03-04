/**
 * Demonstrates vertical split — editor on top, shell on bottom.
 * A common layout for tutorial recordings.
 */
import { record } from "../src/index.ts";

await record(
  "bin/demo-top-bottom.cast",
  { cols: 100, rows: 35, idleTimeLimit: 2 },
  (s) => {
    // Top pane: create a file
    s.typeHuman(
      "cat > hello.sh << 'EOF'\n#!/bin/bash\necho \"Hello from term-recorder!\"\nEOF",
    ).enter();
    s.typeHuman("chmod +x hello.sh").enter();

    // Split vertically — bottom pane
    const bottom = s.splitV(40);

    // Run the script in the bottom pane
    bottom.typeHuman("./hello.sh").enter();

    // Show the file in the top pane
    s.typeHuman("cat hello.sh").enter();

    // Clean up
    bottom.typeHuman("rm hello.sh").enter();

    s.typeHuman("echo 'Demo complete.'").enter();
  },
);

console.log("Recording saved to bin/demo-top-bottom.cast");
console.log("Play with: asciinema play bin/demo-top-bottom.cast");
