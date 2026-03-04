import { ctrl, defineConfig, main, record } from "../src/index.ts";

const config = defineConfig({
  cols: 100,
  rows: 35,
  idleTimeLimit: 2,
});

await main(config, [
  record("basic", (s) => {
    s.typeHuman("echo 'Hello from term-recorder!'").enter();
    s.typeHuman("ls -la").enter();
    s.typeHuman("echo 'Demo complete.'").enter();
  }),

  record("split", (s) => {
    s.typeHuman("echo 'Left pane'").enter();
    const right = s.splitH(50);
    right.typeHuman("echo 'Right pane'").enter();
    s.typeHuman("echo 'Both panes visible!'").enter();
    right.typeHuman("ls").enter();
  }),

  record("exec-wait", (s) => {
    s.typeHuman("echo 'Running a slow command...'").enter();
    s.exec("sleep 2 && echo 'DONE: slow command finished'");
    s.typeHuman("echo 'Now using waitForText...'").enter();
    s.typeHuman("(sleep 1 && echo MARKER_READY) &").enter();
    s.waitForText("MARKER_READY", 5000);
    s.typeHuman("echo 'Detected MARKER_READY — continuing.'").enter();
  }),

  record("keys-ctrl", (s) => {
    s.typeHuman("echo 'first command'").enter();
    s.typeHuman("echo 'second command'").enter();
    s.key("Up").key("Up").key("Down").enter();
    s.typeHuman("this-will-be-cancelled");
    s.type(ctrl("c"));
    s.typeHuman("echo 'Ctrl+C worked, back to clean prompt'").enter();
  }),

  record("top-bottom", (s) => {
    s.typeHuman(
      "cat > hello.sh << 'EOF'\n#!/bin/bash\necho \"Hello from term-recorder!\"\nEOF",
    ).enter();
    s.typeHuman("chmod +x hello.sh").enter();
    const bottom = s.splitV(40);
    bottom.typeHuman("./hello.sh").enter();
    s.typeHuman("cat hello.sh").enter();
    bottom.typeHuman("rm hello.sh").enter();
    s.typeHuman("echo 'Demo complete.'").enter();
  }),
]);
