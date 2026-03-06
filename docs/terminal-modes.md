# Terminal Modes

A short reference on POSIX [TTY][tty] [line-discipline][line-disc] modes. These
concepts apply to Linux and macOS. See the [Windows section](#windows) for how
the same ideas map to the Windows Console API and WSL.

See [terminal-programs.md][taxonomy] for how different programs behave under
these modes, and [readiness-detection.md][detection] for how term-recorder uses
that behavior.

## Canonical (Cooked) Mode

The kernel buffers input line-by-line. Editing keys (backspace, Ctrl-U) are
handled by the TTY driver. The program receives completed lines when the user
presses Enter.

This is the default mode. A plain shell prompt sitting idle is in canonical
mode.

## Cbreak (Rare) Mode

Input is delivered character-by-character (no line buffering), but signal
processing stays enabled — Ctrl-C still sends SIGINT, and flow control (Ctrl-S /
Ctrl-Q) still works. Output processing is also left unchanged.

Cbreak is conceptually between canonical and raw mode. GNU [readline][] uses
cbreak: it clears `ICANON` and `ECHO` but [keeps ISIG set][rl-rltty], so Ctrl-C
still generates SIGINT via the kernel. Readline installs its own signal handlers
to restore terminal state before re-raising. Programs that link readline (bash,
Python ≤ 3.12 REPL, Python ≥ 3.13 [PyREPL][pyrepl] via `tty.setcbreak`) inherit
this behavior.

Most other TUI frameworks go straight to raw mode and handle signals in
application code (see below). [Textual][textual] is a notable exception: it
defaults to raw mode but supports a `TEXTUAL_ALLOW_SIGNALS` environment variable
that keeps ISIG enabled, effectively switching to cbreak.

## Raw Mode

Every keystroke is delivered to the program immediately, and all special
characters (interrupt, quit, flow control) are treated as regular input. The
kernel does no editing and no signal processing — the application handles
everything. On POSIX systems this corresponds to clearing the `ICANON`, `ECHO`,
`ISIG`, and `IEXTEN` [termios][termios] local flags and disabling flow control
(`IXON`/`IXOFF`).

Raw mode is the dominant choice for interactive terminal applications today.
Full-screen programs (vim, tmux, less), REPLs, and AI coding agents all use it.
Each framework reaches raw mode through a different path but the termios flags
end up equivalent:

| Framework                                   | Language | Notable users            | How it enters raw mode                                                               |
| ------------------------------------------- | -------- | ------------------------ | ------------------------------------------------------------------------------------ |
| [Ink][ink]                                  | JS/TS    | Claude Code, Gemini CLI  | Node.js `setRawMode(true)` → [libuv][libuv-tty] clears `ECHO\|ICANON\|IEXTEN\|ISIG`  |
| [Ratatui][ratatui] + [Crossterm][crossterm] | Rust     | Codex CLI (Rust rewrite) | `cfmakeraw` via rustix (or libc)                                                     |
| [Bubble Tea][bubbletea]                     | Go       | OpenCode                 | `charmbracelet/x/term.MakeRaw` replicates `cfmakeraw`                                |
| [prompt_toolkit][prompt_toolkit]            | Python   | Aider                    | [Clears][pt-vt100] `ECHO\|ICANON\|IEXTEN\|ISIG` and `IXON\|IXOFF\|ICRNL` via termios |
| [Textual][textual]                          | Python   | —                        | Same flags as prompt_toolkit; `TEXTUAL_ALLOW_SIGNALS` optionally keeps ISIG          |

GNU [readline][] is a notable absence — it uses cbreak mode, not raw (see
[Cbreak section above](#cbreak-rare-mode)). All frameworks in this table handle
Ctrl-C in application code rather than relying on kernel SIGINT. Bubble Tea's
`WithoutSignals`/`WithoutSignalHandler` options control Go-level signal
handlers, not termios ISIG — the terminal itself is always in raw mode.

Codex CLI originally used Ink (TypeScript) and later migrated to Ratatui (Rust).
The terminal mode did not change — both use raw mode.

In documentation and conversation, "raw mode" is often used loosely to cover
both cbreak and true raw. The [program taxonomy][taxonomy] uses it in this loose
sense.

## Echo

Echo is orthogonal to the mode. In canonical mode the kernel echoes typed
characters. In raw mode the application echoes them (or doesn't). Password
prompts are a common example of canonical mode with echo off (`stty -echo`).

## `stty`

[`stty`][stty] queries and sets terminal line-discipline flags.

- `stty raw` — switch to raw mode (disables signals, echo, and output
  processing)
- `stty -raw` — switch back to canonical mode
- `stty sane` — reset all flags to reasonable defaults: canonical mode, echo on,
  signal processing enabled (ISIG), and control characters restored

term-recorder calls `stty sane` during cleanup (`recorder.ts` after SIGKILL,
`main.ts` shutdown handler) to restore the terminal after a recording session.
If a child process left the TTY in raw mode, with echo off, or with signal
processing disabled, `stty sane` resets all of it so the user's shell behaves
normally again.

## Why This Matters for term-recorder

Programs in raw mode don't produce output the same way canonical programs do.
Readiness [detection strategies][detection] depend on understanding which mode
the target program uses — prompt matching works for raw-mode REPLs but not for
canonical shell commands, and vice versa for `pane_current_command`. The
[program taxonomy][taxonomy] groups programs by these behavioral differences.

Since every major TUI framework and AI coding agent puts the terminal in raw
mode, term-recorder's cleanup (`stty sane`) is critical — a crashed child
process can leave the TTY unusable without it.

## Windows

Windows has no POSIX line discipline or [termios][termios]. The [Windows Console
API][console-api] provides equivalent functionality through `SetConsoleMode`
flags:

| POSIX termios   | Windows Console API             | Effect                                          |
| --------------- | ------------------------------- | ----------------------------------------------- |
| `ICANON`        | `ENABLE_LINE_INPUT`             | Line buffering (wait for Enter vs char-by-char) |
| `ISIG`          | `ENABLE_PROCESSED_INPUT`        | Ctrl-C → signal/event vs raw keystroke          |
| `ECHO`          | `ENABLE_ECHO_INPUT`             | Echo typed characters                           |
| (no equivalent) | `ENABLE_VIRTUAL_TERMINAL_INPUT` | Emit VT100 escape sequences on stdin            |

Windows "raw mode" means disabling `ENABLE_LINE_INPUT`, `ENABLE_ECHO_INPUT`, and
`ENABLE_PROCESSED_INPUT`. Functionally identical to POSIX raw mode, just a
different API surface. CMD and PowerShell 5 use the legacy Windows Console Host.
PowerShell 7 uses `SetConsoleMode` on Windows and termios on Linux/macOS (via
.NET's `Console` abstraction). [Crossterm][crossterm] already handles both — it
calls `SetConsoleMode` on Windows and `cfmakeraw` on Unix.

### WSL Compatibility with term-recorder

term-recorder's tmux + asciinema pipeline runs entirely inside WSL's Linux
environment. The [PTY][pty] chain looks like:

```
CMD / PS5 / Windows Terminal (host terminal emulator)
  → wsl.exe ([ConPTY][conpty] bridge)
    → Linux PTY (WSL kernel)
      → tmux server (own PTY pairs per pane)
        → asciinema (records from tmux's PTY)
          → shell / program under test
```

All PTY interactions use Linux kernel PTYs. The host terminal is just the
outermost renderer — same role as iTerm2 or GNOME Terminal. `stty sane`, control
mode, and headless recording all work unchanged.

**Known caveats in headful mode on the legacy console host (CMD / PS5):**

- **Display garbling** — poor VT100 emulation causes tmux's alternate screen and
  SGR attributes to render incorrectly ([microsoft/terminal#155][term-155],
  [microsoft/WSL#933][wsl-933]). [Windows Terminal][win-terminal] fixes this.
- **Resize propagation** — resizing the CMD/PS5 window may not reliably send
  [SIGWINCH][sigwinch] to tmux inside WSL. term-recorder uses
  `window-size manual`, which avoids this for scripted recordings.

Headless mode (the primary scripted-recording use case) is unaffected by these
host terminal limitations.

[taxonomy]: ./terminal-programs.md
[detection]: ./readiness-detection.md
[readline]: https://tiswww.case.edu/php/chet/readline/rltop.html
[prompt_toolkit]: https://github.com/prompt-toolkit/python-prompt-toolkit
[textual]: https://github.com/Textualize/textual
[ink]: https://github.com/vadimdemedes/ink
[ratatui]: https://github.com/ratatui/ratatui
[crossterm]: https://github.com/crossterm-rs/crossterm
[bubbletea]: https://github.com/charmbracelet/bubbletea
[tty]: https://en.wikipedia.org/wiki/Computer_terminal#Text_terminals
[pty]: https://en.wikipedia.org/wiki/Pseudoterminal
[line-disc]: https://en.wikipedia.org/wiki/Line_discipline
[termios]: https://man7.org/linux/man-pages/man3/termios.3.html
[conpty]:
  https://devblogs.microsoft.com/commandline/windows-command-line-introducing-the-windows-pseudo-console-conpty/
[sigwinch]: https://man7.org/linux/man-pages/man7/signal.7.html
[stty]: https://man7.org/linux/man-pages/man1/stty.1.html
[console-api]: https://learn.microsoft.com/en-us/windows/console/setconsolemode
[win-terminal]: https://github.com/microsoft/terminal
[term-155]: https://github.com/microsoft/terminal/issues/155
[wsl-933]: https://github.com/microsoft/WSL/issues/933
[rl-rltty]:
  https://cgit.git.savannah.gnu.org/cgit/readline.git/tree/rltty.c?h=readline-8.2
[pt-vt100]:
  https://github.com/prompt-toolkit/python-prompt-toolkit/blob/3.0.52/src/prompt_toolkit/input/vt100.py
[libuv-tty]: https://github.com/libuv/libuv/blob/v1.50.0/src/unix/tty.c
[pyrepl]: https://peps.python.org/pep-0762/
