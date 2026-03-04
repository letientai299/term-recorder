# term-recorder

Scriptable terminal recordings. Write TypeScript to drive tmux sessions and
produce [asciicast][asciicast] files you can play back with
[asciinema][asciinema] or embed on the web.

## Requirements

- [Bun][bun] (runtime)
- [tmux][tmux] 3.4+ (session management — uses control mode subscriptions and
  `capture-pane -T`)
- [asciinema][asciinema] 2.0+ (recording — uses `rec --overwrite`)

## Install

```sh
bun install
```

## Quick start

Create a script file (e.g. `demos.ts`):

```ts
import { defineConfig, main, record } from "./src/index.ts";

const config = defineConfig({
  cols: 100,
  rows: 35,
  idleTimeLimit: 2,
});

await main(config, [
  record("hello", (s) => {
    s.type("echo 'Hello from term-recorder!'").enter();
    s.type("ls -la").enter();
  }),
]);
```

Run it:

```sh
bun demos.ts
```

Output lands in `./casts/hello.cast` by default. Play it back:

```sh
asciinema play casts/hello.cast
```

[asciicast]: https://docs.asciinema.org/manual/asciicast/v3/
[asciinema]: https://asciinema.org
[bun]: https://bun.sh
[tmux]: https://github.com/tmux/tmux
