import { defineConfig, main, record } from "../src";

const config = defineConfig({});

const copilot = record("copilot", (s) => {
  s.run("copilot");
  s.waitForText(">", 5000);
  s.run("print the current day of week and calendar day as Monday, 5th");
  s.waitForText("day", 30_000);
  s.key("ctrl-c");
});

await main(config, [copilot]);
