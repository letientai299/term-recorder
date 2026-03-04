import { defineConfig, main, record } from "../src";

const config = defineConfig({});

const claude = record("claude", (s) => {
  s.run("claude");
  s.detectPrompt(30_000);
  s.type("what is 2+2?").key("Enter");
  s.waitForText("4", 30_000);
  s.key("ctrl-d"); // exit
  s.send("echo hello");
});

await main(config, [claude]);
