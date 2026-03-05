import { defineConfig, main, record } from "../src";

const config = defineConfig({
  cols: 80,
  rows: 20,
  typingDelay: 5,
  actionDelay: 5,
  shell: "exec zsh --no-rcs",
  env: { PS1: "%F{blue}%1~%f $ " },
});

const dream = `./examples/dream.ts`;

const inception = record("inception", (s) => {
  s.waitForIdle();
  s.run(`rm -f ${dream}`);
  // s.run(`nvim -u NONE ${dream}`);
  // import { defineConfig, main, record } from "@letientai299/term-recorder"
  s.run(`nvim -u NONE -c "sy on|se noai nosi ls=0" ${dream}`);
  s.type(`i// TERM-RECORDER QUICK TUTORIAL
import { defineConfig, main, record } from "../src"

const config = defineConfig({
  cols: 80, rows: 20,
  shell: "zsh --no-rcs",
  env: { PS1: "%F{green}%1~%f $ " },
});

const dream = record("dream", (s) => {
  s.waitForIdle();
  s.run("echo Hello from the dream!")
  s.waitForIdle();
})

await main(config, [dream]);
`);

  s.key("Escape");
  s.run(":wq");

  s.waitForIdle();
  s.run(`bun ${dream}`);
  s.waitForIdle();
});

await main(config, [inception]);
