# Terminal Program Taxonomy

term-recorder scripts interact with different kinds of terminal programs. Each
kind has different readiness behavior, which determines how you synchronize
actions in a recording script.

See [readiness-detection.md][detection] for how term-recorder detects readiness
for each category.

### Key terms

- **[REPL][repl]** (Read-Eval-Print Loop) — reads one input, evaluates it to
  completion, prints the result, then loops. Input is blocked during evaluation
  (at the application layer — keystrokes still buffer in the kernel). This is a
  [half-duplex][duplex] interaction: one direction at a time.
- **Full-duplex interactive** — input and output flow concurrently. The user can
  type while the program processes or produces output. Chat clients, AI coding
  agents, and music players follow this pattern. Borrowed from
  [telecommunications][duplex]; the voice AI community uses the same term for
  the [same distinction][fd-voice].

## Platform

term-recorder requires `tmux`, which runs on Linux and macOS. On Windows, use
[WSL][wsl] — `tmux` runs natively inside WSL, and the taxonomy below applies
as-is. Native Windows terminals (`cmd.exe`, PowerShell outside WSL) are not
supported.

## By Readiness Behavior

The two sections below — readiness behavior and screen usage — are orthogonal
axes. A program can appear in both (e.g., irssi is full-duplex interactive AND
full-screen). They're separated because each axis requires different detection
mechanics.

### External Commands

`git status`, `cargo build`, `python3 script.py`, etc.

The shell forks a foreground process. While it runs, `tmux` reports it as
[`pane_current_command`][pane-vars]. When it exits, the value returns to the
shell name (`zsh`, `bash`) and the shell prints a new prompt.

Short-lived commands (`git status`, `ls`) finish quickly — readiness means the
prompt reappeared. Long-running commands (`npm install`, `cargo build`) produce
continuous output before eventually exiting the same way.

### Shell Built-ins and Functions

`cd`, `export`, `alias`, `source`, user-defined functions.

No child process is forked. `pane_current_command` stays as the shell name the
entire time — indistinguishable from idle. Readiness can only be detected by
prompt reappearance.

### Persistent Processes

Dev servers (`next dev`, `vite`), `docker compose up`, `tail -f`.

The shell forks a process that runs indefinitely. `pane_current_command` changes
when it starts but never reverts to the shell. The process is "ready" when a
specific output line appears (e.g., "Listening on port 3000"), not when it
exits.

Script runners (`npm run dev`, `bun run dev`) add a layer: they spawn
`sh -c <script>`, so `pane_current_command` shows `sh` or `bash` — not the
actual server. The readiness signal is the same (match specific output), but
`pane_current_command` is unreliable for identifying what's running.

### Mid-Execution Prompts

`sudo`, `ssh` (host key confirmation), `rm -i`, `apt install`.

A running command pauses for user input — a password, a yes/no confirmation, or
a selection. `pane_current_command` still shows the program name, but the
program is blocked on a prompt. Readiness here means the prompt text appeared
and the program is waiting for a response.

### Prompt-Gated REPLs

`python`, [`irb`][irb], [`iex`][iex], etc.

Don't print the prompt until ready for the next command. The terminal is in [raw
or cbreak mode][modes] depending on the framework (see
[terminal-modes.md][modes] for details). During execution: no echo, keypresses
buffer in the kernel. When done: the line editor wakes, buffered chars echo all
at once, and the prompt appears on the last line.

### Full-Duplex Interactive

[Claude Code][claude-code], [Codex CLI][codex-cli], [Gemini CLI][gemini-cli],
[`irssi`][irssi], [`weechat`][weechat].

Accept keystrokes while processing. Input is never blocked — the user can type,
cancel, or navigate while the program produces output or updates its display.
The UI layout varies: some show a prompt with an output region above it, others
add a status bar or spinner, others use a full-screen split with an input field
and output pane. The common trait is the concurrent input/output flow, not any
particular visual arrangement.

## By Screen Usage

Most full-screen programs use the [alternate screen buffer][altscreen]
(smcup/rmcup). When they exit, the terminal switches back to the normal buffer
and previous scrollback reappears. Exceptions exist: [`dialog`][dialog]
suppresses the alternate screen in xterm-family terminals, and programs using
raw VT100 sequences directly may skip it entirely.

`tmux`'s `capture-pane` returns the **normal** buffer by default.
`capture-pane -a` is needed to read the alternate screen. When a full-screen
program exits, `capture-pane` content changes abruptly as the normal buffer
becomes visible again.

### Full-Screen Stable

`vim`, [`nvim`][nvim], [`ranger`][ranger], [`yazi`][yazi]

Redraw the entire screen. Content is stable when idle. You know the program is
ready when a specific UI element appears (mode indicator, filename in the status
line, directory listing).

### Full-Screen Real-Time

`top`, [`htop`][htop], [`btop`][btop], [`cmus`][cmus]

Constant redraws with live data. Content is never stable. No "ready" concept —
they always accept keystrokes. Scripts just interact directly.

### Full-Screen REPL

[`iredis`][iredis], [`pgcli`][pgcli], [`harlequin`][harlequin],
[`lazysql`][lazysql]

Full-screen layout (via [prompt_toolkit][] or a custom TUI) with a REPL prompt
inside the frame. A toolbar or status bar occupies the bottom lines. Prompt is
visible but not on the last line of the terminal.

### Picker / Dialog

[`fzf`][fzf], [`gum`][gum], [`dialog`][dialog], [`whiptail`][whiptail]

Interactive selection overlays — sometimes full-screen, sometimes partial. They
accept keystrokes and exit with a selection. Transient: they appear briefly
during a pipeline or script.

When invoked directly (`fzf < file`), `pane_current_command` shows the picker's
name and reverts on exit. In pipelines (`cat file | fzf`), it shows the pipeline
leader (first command). Via shell widgets like zsh's Ctrl-R, the picker runs
inside a command substitution — `pane_current_command` stays as the shell name.

## Edge Cases

### Nested Multiplexers

Running `tmux`-inside-`tmux` or [`screen`][screen]-inside-`tmux`. The outer
`tmux`'s `pane_current_command` shows `tmux` or `screen` and never changes,
regardless of what runs inside the inner session. Pane content capture still
works (it sees the inner multiplexer's rendered output).

[repl]: https://en.wikipedia.org/wiki/Read%E2%80%93eval%E2%80%93print_loop
[duplex]: https://en.wikipedia.org/wiki/Duplex_(telecommunications)
[fd-voice]: https://arxiv.org/html/2509.22243v1
[detection]: ./readiness-detection.md
[modes]: ./terminal-modes.md
[altscreen]:
  https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h2-The-Alternate-Screen-Buffer
[pane-vars]: https://man7.org/linux/man-pages/man1/tmux.1.html#FORMATS
[readline]: https://tiswww.case.edu/php/chet/readline/rltop.html
[prompt_toolkit]: https://github.com/prompt-toolkit/python-prompt-toolkit
[irb]: https://github.com/ruby/irb
[iex]: https://hexdocs.pm/iex/IEx.html
[claude-code]: https://github.com/anthropics/claude-code
[codex-cli]: https://github.com/openai/codex
[gemini-cli]: https://github.com/google-gemini/gemini-cli
[irssi]: https://github.com/irssi/irssi
[weechat]: https://github.com/weechat/weechat
[cmus]: https://github.com/cmus/cmus
[nvim]: https://github.com/neovim/neovim
[ranger]: https://github.com/ranger/ranger
[yazi]: https://github.com/sxyazi/yazi
[htop]: https://github.com/htop-dev/htop
[btop]: https://github.com/aristocratos/btop
[iredis]: https://github.com/laixintao/iredis
[pgcli]: https://github.com/dbcli/pgcli
[harlequin]: https://harlequin.sh/
[lazysql]: https://github.com/jorgerojas26/lazysql
[fzf]: https://github.com/junegunn/fzf
[gum]: https://github.com/charmbracelet/gum
[dialog]: https://invisible-island.net/dialog/
[whiptail]: https://pagure.io/newt
[screen]: https://savannah.gnu.org/projects/screen
[wsl]: https://learn.microsoft.com/en-us/windows/wsl/
