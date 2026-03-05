# Contributing

[mise][mise] manages all dev tools. After cloning:

```sh
mise install      # installs bun, tmux, asciinema, agg, prek
bun install       # installs npm dependencies
prek install      # activates git hooks (lint, fmt, test on commit)
```

On Windows, use [WSL 2][wsl] — tmux has no native Windows port. Inside WSL the
setup is identical.

See `mise tasks` for available commands.

## Building

```sh
mise build        # compile TypeScript to dist/
```

Produces `.js`, `.d.ts`, `.d.ts.map`, and `.js.map` files in `dist/`.
`prepublishOnly` runs this automatically before `npm publish`.

## Recording

```sh
mise record        # headless, parallel — outputs to casts/*.cast
mise record:ui     # headful, sequential — same output, visible terminal
```

Both tasks track `src/**/*.ts` and `examples/**/*.ts` as inputs and
`casts/*.cast` as outputs. mise skips re-recording when sources haven't changed.
Use `mise run --force record` to bypass the check, or `mise clean` to wipe
`casts/` and `dist/` first.

## GIF generation

```sh
mise gif
```

Converts all `casts/*.cast` to `casts/*.gif`. On first run, it downloads
[FiraCode Nerd Font][firacode-nf] into `.fonts/` (cached for subsequent runs).

Like the record tasks, `mise gif` skips when outputs are newer than inputs.

## Other tasks

| Task            | Description                   |
| --------------- | ----------------------------- |
| `mise build`    | Compile TypeScript to `dist/` |
| `mise test`     | Unit tests                    |
| `mise e2e`      | End-to-end tests (needs tmux) |
| `mise test:all` | All tests                     |
| `mise lint`     | Type-check and lint           |
| `mise fmt`      | Format with Prettier          |
| `mise clean`    | Remove `casts/` and `dist/`   |

## Publishing

```sh
npm version patch   # or minor, major — commits and tags automatically
git push && git push --tags
npm publish --access public
```

`prepublishOnly` runs `mise build` before packing, so `dist/` is always fresh.

[firacode-nf]: https://github.com/ryanoasis/nerd-fonts/releases
[mise]: https://mise.jdx.dev
[wsl]: https://learn.microsoft.com/en-us/windows/wsl/install
