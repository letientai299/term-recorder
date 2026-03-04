import { defineConfig, main, record } from "../src";

const config = defineConfig({});

const copilot = record("copilot", (s) => {
  s.run(
    "copilot --disable-builtin-mcps --no-custom-instructions --no-experimental --no-auto-update",
  );
  s.detectPrompt(30_000);
  s.reply("print the current day of week and calendar day as Monday, 5th", 30_000);
  s.key("ctrl-c"); // exit
  s.send("echo hello");
});

await main(config, [copilot]);
