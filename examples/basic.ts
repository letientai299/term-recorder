import { record } from "../src/index.ts";

await record(
  "bin/demo-basic.cast",
  { cols: 100, rows: 30, idleTimeLimit: 2 },
  (s) => {
    s.sleep(500);
    s.typeHuman("echo 'Hello from term-recorder!'").enter();
    s.sleep(1000);
    s.typeHuman("ls -la").enter();
    s.sleep(1500);
    s.typeHuman("echo 'Demo complete.'").enter();
    s.sleep(1000);
  },
);

console.log("Recording saved to bin/demo-basic.cast");
console.log("Play with: asciinema play bin/demo-basic.cast");
