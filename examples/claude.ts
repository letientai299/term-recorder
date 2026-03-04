import { defineConfig, main, record } from "../src";

const config = defineConfig({});

const claude = record("claude", (s) => {
  s.run("claude");
  s.waitForText(">", 30_000);
  s.run("what is 2+2?");
  s.waitForText("4", 30_000);
  s.key("ctrl-d");
});

await main(config, [claude]);
