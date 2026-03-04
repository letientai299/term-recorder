import { defineConfig, main, record } from "../src";

const config = defineConfig({});

const py = record("python-repl", (s) => {
  s.typeHuman("python3").enter();
  s.waitForText(">>>", 5000);
  s.typeHuman("2 + 2").enter();
  s.waitForText("4", 3000);
  s.typeHuman("import math; math.pi").enter();
  s.waitForText("3.14", 3000);
  s.typeHuman("[x**2 for x in range(10)]").enter();
  s.waitForText("[0, 1,", 3000);
  s.typeHuman("exit()").enter();
});

const vim = record("vim-edit", (s) => {
  s.exec("echo 'hello world' > /tmp/tr-test.txt");
  s.typeHuman("vim /tmp/tr-test.txt").enter();
  s.sleep(1000);
  s.key("Down");
  s.typeHuman("o");
  s.typeHuman("added by term-recorder");
  s.key("Escape");
  s.typeHuman(":wq").enter();
  s.sleep(500);
  s.typeHuman("cat /tmp/tr-test.txt").enter();
  s.sleep(1000);
  s.exec("rm /tmp/tr-test.txt");
});

const less = record("less-pager", (s) => {
  s.typeHuman("seq 200 | less").enter();
  s.sleep(1000);
  s.key("Space");
  s.sleep(500);
  s.key("Space");
  s.sleep(500);
  s.typeHuman("/150").enter();
  s.sleep(500);
  s.typeHuman("q");
});

const recordings = [py, vim, less];
await main(config, recordings);
