import { defineConfig, main, record } from "../src";

const config = defineConfig({});

const py = record("python-repl", (s) => {
  s.run("python3");
  s.detectPrompt();
  s.reply("2 + 2");
  s.reply("import math; math.pi");
  s.reply("[x**2 for x in range(10)]");
  s.run("exit()");
});

const vim = record("vim-edit", (s) => {
  s.exec("echo 'hello world' > /tmp/tr-test.txt");
  s.run("vim /tmp/tr-test.txt");
  s.pause();
  s.key("Down");
  s.type("o");
  s.type("added by term-recorder");
  s.key("Escape");
  s.run(":wq");
  s.pause(500);
  s.run("cat /tmp/tr-test.txt");
  s.pause();
  s.exec("rm /tmp/tr-test.txt");
});

const less = record("less-pager", (s) => {
  s.run("seq 200 | less");
  s.pause();
  s.key("Space");
  s.pause(500);
  s.key("Space");
  s.pause(500);
  s.type("/150").enter();
  s.pause(500);
  s.type("q");
});

const recordings = [py, vim, less];
await main(config, recordings);
