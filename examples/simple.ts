import { ctrl, defineConfig, main, record } from "../src";

const config = defineConfig({});

const hello = record("hello", (s) => {
  s.type("echo 'Hello from term-recorder!'").enter();
  s.type("ls -la").enter();
  s.type("echo 'Demo complete.'").enter();
});

const split = record("split", (s) => {
  s.type("echo 'Left pane'").enter();
  const right = s.splitH(50);
  right.type("echo 'Right pane'").enter();
  s.type("echo 'Both panes visible!'").enter();
  right.type("ls").enter();
});

const exec = record("exec-wait", (s) => {
  s.type("echo 'Running a slow command...'").enter();
  s.exec("sleep 2 && echo 'DONE: slow command finished'");
  s.type("echo 'Now using waitForText...'").enter();
  s.type("(sleep 1 && echo MARKER_READY) &").enter();
  s.waitForText("MARKER_READY", 5000);
  s.type("echo 'Detected MARKER_READY — continuing.'").enter();
});

const keys = record("keys-ctrl", (s) => {
  s.type("echo 'first command'").enter();
  s.type("echo 'second command'").enter();
  s.key("Up").key("Up").key("Down").enter();
  s.type("this-will-be-cancelled");
  s.send(ctrl("c"));
  s.type("echo 'Ctrl+C worked, back to clean prompt'").enter();
});

const topBottom = record("top-bottom", (s) => {
  s.type(
    "cat > hello.sh << 'EOF'\n#!/bin/bash\necho \"Hello from term-recorder!\"\nEOF",
  ).enter();
  s.type("chmod +x hello.sh").enter();
  const bottom = s.splitV(40);
  bottom.type("./hello.sh").enter();
  s.type("cat hello.sh").enter();
  bottom.type("rm hello.sh").enter();
  s.type("echo 'Demo complete.'").enter();
});

await main(config, [hello, split, exec, keys, topBottom]);
