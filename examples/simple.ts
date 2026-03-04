import { defineConfig, main, record } from "../src";

const config = defineConfig({});

const hello = record("hello", (s) => {
  s.run("echo 'Hello from term-recorder!'");
  s.run("ls -la");
  s.run("echo 'Demo complete.'");
});

const split = record("split", (s) => {
  s.run("echo 'Left pane'");
  const right = s.splitH(50);
  right.run("echo 'Right pane'");
  s.run("echo 'Both panes visible!'");
  right.run("ls");
});

const exec = record("exec-wait", (s) => {
  s.run("echo 'Running a slow command...'");
  s.exec("sleep 2 && echo 'DONE: slow command finished'");
  s.run("echo 'Now using waitForText...'");
  s.run("(sleep 1 && echo MARKER_READY) &");
  s.waitForText("MARKER_READY", 5000);
  s.run("echo 'Detected MARKER_READY — continuing.'");
});

const keys = record("keys-ctrl", (s) => {
  s.run("echo 'first command'");
  s.run("echo 'second command'");
  s.key("Up").key("Up").key("Down").enter();
  s.type("this-will-be-cancelled");
  s.key("ctrl-c");
  s.run("echo 'Ctrl+C worked, back to clean prompt'");
});

const topBottom = record("top-bottom", (s) => {
  s.run(
    "cat > hello.sh << 'EOF'\n#!/bin/bash\necho \"Hello from term-recorder!\"\nEOF",
  );
  s.run("chmod +x hello.sh");
  const bottom = s.splitV(40);
  bottom.run("./hello.sh");
  s.run("cat hello.sh");
  bottom.run("rm hello.sh");
  s.run("echo 'Demo complete.'");
});

await main(config, [hello, split, exec, keys, topBottom]);
