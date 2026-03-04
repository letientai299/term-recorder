/**
 * Demonstrates vertical split — editor on top, shell on bottom.
 * A common layout for tutorial recordings.
 */
import { record } from "../src/index.ts";

await record(
  "bin/demo-top-bottom.cast",
  { cols: 100, rows: 35, idleTimeLimit: 2 },
  (s) => {
    s.sleep(500);

    // Top pane: create a file
    s.typeHuman(
      "cat > hello.sh << 'EOF'\n#!/bin/bash\necho \"Hello from term-recorder!\"\nEOF",
    ).enter();
    s.sleep(800);
    s.typeHuman("chmod +x hello.sh").enter();
    s.sleep(500);

    // Split vertically — bottom pane
    const bottom = s.splitV(40);
    s.sleep(500);

    // Run the script in the bottom pane
    bottom.typeHuman("./hello.sh").enter();
    bottom.sleep(800);

    // Show the file in the top pane
    s.typeHuman("cat hello.sh").enter();
    s.sleep(1000);

    // Clean up
    bottom.typeHuman("rm hello.sh").enter();
    bottom.sleep(500);

    s.typeHuman("echo 'Demo complete.'").enter();
    s.sleep(1000);
  },
);

console.log("Recording saved to bin/demo-top-bottom.cast");
console.log("Play with: asciinema play bin/demo-top-bottom.cast");
