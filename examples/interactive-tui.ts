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
  s.detectPrompt();
  s.reply("echo 'hello world' > /tmp/tr-test.txt");
  s.run("vim /tmp/tr-test.txt");
  s.key("Down");
  s.type("o");
  s.type("added by term-recorder");
  s.key("Escape");
  s.run(":wq");
  s.run("cat /tmp/tr-test.txt");
  s.pace(0);
  s.reply("rm /tmp/tr-test.txt");
});

const less = record("less-pager", (s) => {
  s.run("seq 200 | less");
  s.key("Space");
  s.key("Space");
  s.type("/150").enter();
  s.type("q");
  s.pace(0);
});

const recordings = [py, vim, less];
await main(config, recordings);
