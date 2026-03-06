# About term-recorder

## Target Audience

Maintainers of TUI products — CLI tools, REPL environments, full-screen
applications, AI coding agents. They could use term-recorder for:

- **Showcase recordings** — polished demos for READMEs and docs.
- **CI-generated documentation** — scripted recordings that run in CI so
  terminal GIFs and screenshots stay in sync with each release.
- **Bug reports** — reproducible terminal sessions that capture exact behavior.
- **Sales and onboarding demos** — scripted, reproducible terminal demos for
  developer tools. Multi-pane support lets you show "run this here, see the
  effect there."
- **AI agent evaluation** — record agent sessions across models, compare
  behavior, and verify outcomes.
- **E2e testing** _(future)_ — assertion APIs to validate rendered terminal
  output in CI. The goal: become Playwright for terminals.

## Multi-Pane Usage

Scripts often drive the product under test in one pane while running shell
commands in other panes — modifying files, starting services, changing
environment variables — to show how the product reacts to its surroundings or
integrates with other tools.

## Design Goals

- Drive a **real PTY** via tmux, not a mocked terminal.
- Keep the scripting API **thin and blocking** — sync with actual execution
  state, so pausing in a debugger also pauses the terminal.
- Record output as **asciicast v3** via asciinema CLI 3.x.
- Support headful and headless modes with the same script semantics.
- Isolate recordings so parallel and nested runs do not collide.
