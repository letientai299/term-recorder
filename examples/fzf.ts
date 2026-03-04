import { defineConfig, main, record } from "../src";

const config = defineConfig({});

const fzf = record("fzf", (s) => {
  // Write items to a temp file, then pipe into fzf with multi-select
  s.send("printf 'apple\\nbanana\\ncherry\\ndate\\nfig\\ngrape\\n' | fzf --multi");
  s.enter();
  s.waitForText("apple");

  // Navigate with ctrl-j / ctrl-k (same as arrow keys in fzf)
  s.key("ctrl-j");
  s.key("ctrl-j");

  // Toggle selection with Tab
  s.key("Tab");
  s.key("ctrl-k");
  s.key("Tab");

  // Confirm selection
  s.key("Enter");
});

await main(config, [fzf]);
