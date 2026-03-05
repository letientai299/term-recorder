import { defineConfig, main, record } from "../src";

const config = defineConfig({});

const agents = record("agents", (s) => {
  const agents = ["claude", "copilot"];
  for (const agent of agents) {
    s.run(agent);
    s.run("compute 12! and answer using digit only");
    s.waitForText("479001600");
    s.key("ctrl-c", "ctrl-c");
    s.sleep(200);
  }
});

await main(config, [agents]);
