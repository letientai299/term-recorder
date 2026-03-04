import { defineConfig, main, record } from "../src";

const config = defineConfig({});

const py = record("python-repl", (s) => {
  s.type("python3").enter();
  s.detectPrompt();
  s.type("2 + 2").enter();
  s.waitForPrompt();
  s.type("import math; math.pi").enter();
  s.waitForPrompt();
  s.type("[x**2 for x in range(10)]").enter();
  s.waitForPrompt();
  s.type("exit()").enter();
});

const vim = record("vim-edit", (s) => {
  s.exec("echo 'hello world' > /tmp/tr-test.txt");
  s.type("vim /tmp/tr-test.txt").enter();
  s.sleep(1000);
  s.key("Down");
  s.type("o");
  s.type("added by term-recorder");
  s.key("Escape");
  s.type(":wq").enter();
  s.sleep(500);
  s.type("cat /tmp/tr-test.txt").enter();
  s.sleep(1000);
  s.exec("rm /tmp/tr-test.txt");
});

const less = record("less-pager", (s) => {
  s.type("seq 200 | less").enter();
  s.sleep(1000);
  s.key("Space");
  s.sleep(500);
  s.key("Space");
  s.sleep(500);
  s.type("/150").enter();
  s.sleep(500);
  s.type("q");
});

const recordings = [py, vim, less];
await main(config, recordings);
