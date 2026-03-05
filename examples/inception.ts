import { defineConfig, main, record } from "../src";

const config = defineConfig({
  cols: 80,
  rows: 20,
  shell: "exec zsh --no-rcs",
  // env: { PS1: "%F{blue}%1~%f $ " },
  env: { PS1: "%F{blue}inception $%f " },
});

const dream = `./examples/dream.ts`;

const inception = record("inception", (s) => {
  s.run(`rm -f ${dream}`);
  // s.run(`nvim -u NONE ${dream}`);
  // import { defineConfig, main, record } from "@letientai299/term-recorder"
  s.run(`nvim -u NONE -c "sy on|se noai nosi ls=0" ${dream}`);
  s.type(`i// term-recorder tutorial
import { defineConfig, main, record } from "../src"

const config = defineConfig({
  cols: 80, rows: 20,
  shell: "zsh --no-rcs",
  env: { PS1: "%F{green}dream $%f " },
});

const dream = record("dream", (s) => {
  s.run("echo Hello world");
  const bottom = s.splitV(80);
  bottom.run("claude");
  bottom.waitForIdle()
  bottom.run("What is the meaning of life? End your answer with 42.")
  bottom.waitForText("42")
  bottom.key("ctrl-c", "ctrl-c")
})

await main(config, [dream]);
`);

  s.key("Escape");
  s.run(":wq");

  s.run(`bun ${dream}`);
  s.waitForText("inception $", 30_000);
  s.run("echo Wake up!");
});

await main(config, [inception]);
