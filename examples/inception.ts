import { tmpdir } from "node:os";
import { defineConfig, main, record } from "../src";

const config = defineConfig({
  cols: 100,
  rows: 20,
  typingDelay: 10,
  actionDelay: 50,
  shell: "exec zsh --no-rcs",
  env: { PS1: "%F{cyan}%~%f\n$ " },
});

const dream = `${tmpdir()}/dream.ts`;

const inception = record("inception", (s) => {
  s.run(`rm ${dream}`);
  s.run(`vim -u NONE ${dream}`);
  s.type(`iimport { defineConfig, main, record } from "@letientai299/term-recorder"

const config = defineConfig({});

console.log(config);
`);

  s.key("Escape");
  s.run(":wq");

  s.waitForIdle();
  s.run(`cat ${dream}`);
  s.waitForIdle();
  // s.sleep(1000);
  // s.run(`bun ${dream}`);
  // s.sleep(1000);
});

await main(config, [inception]);
