import { defineConfig, main, record } from "../src";

const config = defineConfig({});

const fzf = record("fzf", (s) => {
  s.send(
    "printf 'apple\\nbanana\\ncherry\\ndate\\nfig\\ngrape\\n' | fzf --multi",
  );
  s.enter();
  s.waitForText("apple");

  s.key("ctrl-j").key("ctrl-j");
  s.key("Tab").key("ctrl-k").key("Tab");
  s.key("Enter");
});

await main(config, [fzf]);
