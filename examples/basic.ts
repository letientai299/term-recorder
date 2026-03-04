import { record } from "../src/index.ts";

await record(
  "bin/demo-basic.cast",
  { cols: 100, rows: 30, idleTimeLimit: 2 },
  (s) => {
    s.typeHuman("echo 'Hello from term-recorder!'").enter();
    s.typeHuman("ls -la").enter();
    s.typeHuman("echo 'Demo complete.'").enter();
  },
);

console.log("Recording saved to bin/demo-basic.cast");
console.log("Play with: asciinema play bin/demo-basic.cast");
