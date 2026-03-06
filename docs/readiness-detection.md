# Readiness Detection

How term-recorder knows when a terminal program is ready for the next action.
Each signal works for some [program categories][taxonomy] and fails for others.
No universal signal exists — a layered approach is necessary.

## The Problem

Recording scripts need to send input at the right moment. Too early and input is
lost or misinterpreted. Too late and recordings have awkward pauses. The current
API exposes this problem to users as `waitFor*` calls and `sleep()` — neither is
reliable across program categories.

term-recorder [users][about] drive their product under test in one pane while
running shell commands in auxiliary panes. Readiness detection must work across
all of them: the product pane (TUI, REPL, or full-duplex interactive) and the
auxiliary panes (shell commands, dev servers, other CLIs). The hard problem is
the product pane — shell readiness in auxiliary panes is largely solved.

The goal: make input actions **blocking by default**, so the next action fires
only when the target program is ready. Users should rarely need explicit waits.

## Available Signals

| Signal                            | Mechanism                              | Latency      | Works for               | Fails for                                      |
| --------------------------------- | -------------------------------------- | ------------ | ----------------------- | ---------------------------------------------- |
| [`pane_current_command`][pane-cc] | tmux format [subscription][sub]        | up to ~1s    | Shell commands          | REPLs, TUIs (value never changes)              |
| Last-line prompt match            | [`capture-pane`][capture-pane] polling | poll-based   | Prompt-gated REPLs      | Full-screen REPLs (prompt not last line)       |
| Arbitrary text match              | [`capture-pane`][capture-pane] polling | poll-based   | TUIs, overlay REPLs     | Text already in scrollback                     |
| `%output` event timing            | tmux [control mode][control-mode]      | ~15ms        | Wakeup hint only        | Not a readiness signal by itself               |
| `%output` silence window          | Debounced `%output` absence            | configurable | Rough "done" heuristic  | Premature if output has pauses                 |
| [`wait-for`][waitfor] channel     | Explicit tmux signaling                | ~0ms         | Shell commands          | REPLs, TUIs (requires cooperation)             |
| [OSC 133][osc133]                 | tmux grid line flags (≥ 3.4)           | ~0ms         | Shells with integration | Shell must emit sequences; tmux ≥ 3.4 required |
| Keypress echo probe               | Send char, check if it echoes          | ~50ms        | REPLs (readline)        | Destructive — char enters input buffer         |

### `pane_current_command` Subscription

tmux tracks the foreground process group leader via `tcgetpgrp()` on the pane's
PTY master. Subscribe with `refresh-client -B` and receive
`%subscription-changed` when the value changes.

**Strengths:** Zero-config. Fires when a shell command starts (`zsh` → `cargo`)
and when it exits (`cargo` → `zsh`). Combined with prompt detection, this is the
most reliable shell command readiness signal.

**Weaknesses:**

- Reports the process group leader, not the leaf process. `npm run dev` shows
  `sh` or `bash`, not `vite`.
- Never changes for REPLs — `python3` stays `python3` whether executing or idle.
- Subscription check interval introduces up to ~1s latency (hardcoded 1-second
  timer in `control_check_subs_timer`).

### `capture-pane` + Text Matching

Fetch the visible pane content (last N lines) and match against a pattern. This
is the workhorse for REPLs and TUIs.

**Strengths:** Works for any program that produces visible output. No
cooperation needed.

**Weaknesses:**

- Polling overhead. Each check is a tmux RPC (`capture-pane -p -t <target>`).
- Visibility window. Content scrolled beyond the captured range is invisible.
  Transient output that appears and disappears between polls is missed.
- False positives. Text already in scrollback matches immediately. The same
  string appearing in output and in the prompt is ambiguous.

`%output` notifications reduce polling latency — instead of blind 500ms polls,
the wait loop re-checks on each `%output` burst (debounced at ~15ms).

### `wait-for` Channel — Cooperative Signaling

tmux's [`wait-for`][waitfor] command provides explicit, zero-latency signaling:

```sh
# Inject into the command stream:
tmux send-keys "long-command; tmux wait-for -S done" Enter
# Block until signal:
tmux wait-for done
```

Or via shell hooks for automatic prompt-ready signaling:

```sh
# In the pane's shell profile:
PROMPT_COMMAND='tmux wait-for -S prompt-ready'
```

**Strengths:** 100% reliable for shell commands. No polling, no text matching.

**Weaknesses:** Cooperative — the pane must explicitly signal. Does not work for
REPLs or TUIs. Requires injecting tmux commands into the shell's command stream
or configuring shell hooks, which changes what the recording captures.

### OSC 133 — Shell Integration Sequences

Shells with [shell integration][shell-int] emit escape sequences at prompt
boundaries:

| Sequence                  | Meaning                               |
| ------------------------- | ------------------------------------- |
| `OSC 133 ; A ST`          | Prompt starts (shell ready for input) |
| `OSC 133 ; B ST`          | Command input starts                  |
| `OSC 133 ; C ST`          | Command output starts                 |
| `OSC 133 ; D [; exit] ST` | Command finished, with exit code      |

This is the gold standard — semantic prompt/command boundaries with exit codes.

tmux ≥ 3.4 parses OSC 133 `A` (prompt start) and `C` (command output start),
storing them as per-line flags on the scrollback grid ([issue
#3064][tmux-3064]). It does **not** handle `B` (command start) or `D` (command
finished with exit code). The `next-prompt`/`previous-prompt` copy-mode commands
use these flags.

**Limitations:**

- No `D` parameter means tmux cannot signal "command finished" — the most useful
  readiness event. Only prompt-start (`A`) is available, which requires waiting
  for the next prompt rather than detecting command completion.
- Requires tmux ≥ 3.4. Older versions ignore the sequences entirely.
- Requires the user's shell to emit OSC 133. [fish][fish] ≥ 4.0 has it built-in;
  bash/zsh need `PROMPT_COMMAND`/`precmd` hooks via tools like
  [oh-my-posh][omp].
- In control mode, the raw escape bytes appear in `%output` data. Parsing them
  is fragile — sequences can span multiple `%output` chunks.

### Keypress Echo Probe

In [raw/cbreak mode][modes], echo is handled by the application (readline, not
the TTY driver). During REPL execution, readline is not running — keystrokes
buffer without echo. When the REPL returns to its line editor, buffered chars
echo immediately.

Mechanism: type a probe character, capture the pane, check if it appeared. If it
did, the program is ready. Erase the probe with backspace or Ctrl-U.

**Strengths:** True readiness signal — tests whether the program is actively
reading input.

**Weaknesses:** Destructive. The probe character enters the input buffer and
must be cleaned up. If cleanup fails (e.g., program does not support Ctrl-U),
the probe contaminates the session. Race condition: if the program becomes ready
_between_ send and capture, the probe echoes but is already part of the next
command.

This is what `detectPrompt` does today — it types a random marker, finds it in
the pane content, and erases it.

## Strategy by Program Category

The right strategy depends on the [program category][taxonomy]:

| Category                | Primary signal                        | Fallback            |
| ----------------------- | ------------------------------------- | ------------------- |
| External commands       | `pane_current_command` change         | Prompt text match   |
| Shell built-ins         | Prompt text match                     | `%output` silence   |
| Persistent processes    | Text match (e.g., "Listening")        | `%output` silence   |
| Mid-execution prompts   | Text match (prompt string)            | —                   |
| Prompt-gated REPLs      | Last-line prompt match                | Keypress echo probe |
| Full-duplex interactive | Text match (specific content)         | `%output` silence   |
| Full-screen stable      | Text match (UI element)               | —                   |
| Full-screen real-time   | Text match (if specific state needed) | —                   |

## Design Direction: Implicit Readiness

The current API requires explicit `waitFor*` calls. A better model: **each input
action blocks until the target pane is ready**, using the best available signal
for the detected program category.

### How It Could Work

1. **User declares pane mode.** The script author knows what they are driving.
   Rather than auto-detecting the category (which is heuristic and fragile), the
   user declares it: `pane.mode("repl", { prompt: ">>>" })` or
   `pane.mode("tui")`. The default mode is `"shell"` for new panes.

2. **Choose readiness strategy.** Based on the declared mode, select the primary
   and fallback signals from the strategy table above.

3. **Block before input.** Before each `type`/`send`/`key` action, run the
   readiness check. The action proceeds only after readiness is confirmed or
   timeout expires.

4. **Allow overrides.** Users can still call explicit `waitForText()` for cases
   the mode system does not cover. `pace(0)` disables implicit waits.

### The Hard Problem: TUIs and Full-Duplex Programs

Shell command readiness is largely solved (`pane_current_command` + prompt
match). The real challenge is the products term-recorder users are driving:

- **Full-screen TUIs** (vim, [yazi][yazi], [lazysql][lazysql]). Ready when a
  specific UI element appears. No prompt to match. The user must specify what
  "ready" looks like — a status bar string, a filename in the title, a mode
  indicator. There is no generic signal.

- **Prompt-gated REPLs** (python, irb, iex). Ready when the prompt reappears on
  the last line. This works if the user provides the prompt string.
  `detectPrompt` can bootstrap it, but is destructive and only works for
  readline-based REPLs.

- **Full-screen REPLs** ([pgcli][pgcli], [iredis][iredis],
  [harlequin][harlequin]). The prompt exists but is not on the last terminal
  line — a status bar sits below it. Last-line matching fails. Need a
  full-screen text match instead.

- **Full-duplex interactive** (Claude Code, Codex CLI, [irssi][irssi]). Accept
  input while producing output. There is no "ready" state — the program is
  always accepting keystrokes. The script author must decide what to wait for (a
  specific response, a spinner stopping, output containing a marker).

For all of these, `capture-pane` + text matching is the only viable signal. The
question is how to reduce the boilerplate so users do not write `waitForText`
after every action.

### Possible Approaches

**Approach A: Mode-based implicit waits.** Each pane mode defines a default
readiness check. Shell mode waits for prompt. REPL mode waits for prompt on last
line. TUI mode does nothing (user must use explicit waits). This covers the
common cases and stays predictable.

**Approach B: `%output` silence as default.** After any input action, wait until
`%output` goes quiet for N ms. Simple, universal, but fragile — programs that
pause mid-output trigger false readiness. Only useful as a rough heuristic, not
a primary strategy.

**Approach C: User-provided readiness predicate.** The user supplies a function
that receives the pane content and returns true when ready:
`pane.ready((content) => content.includes(">>>"))`. Runs after every input
action. Flexible but verbose.

### Shell Setup Phase

For shell commands during setup (`cd`, `npm install`, `cargo build`), combining
`pane_current_command` subscription + prompt match works well:

1. Subscribe to `pane_current_command`. When it changes back to the shell name
   (e.g., `zsh`), the external command has exited.
2. Confirm with a prompt match — the shell has printed its prompt.

This is fast (subscription is push-based) and zero-config. For built-ins (where
`pane_current_command` never changes), fall back to prompt match alone.

### Challenges

- **Prompt detection requires a probe.** The first time a pane enters REPL mode,
  we do not know the prompt string. `detectPrompt` solves this but is
  destructive.
- **False readiness.** A long-running command that pauses output is not "ready"
  — it is just quiet. `%output` silence is a heuristic, not a signal.
- **Performance cost.** Readiness checks before every action add latency.
  `pane_current_command` subscriptions fire asynchronously, but `capture-pane`
  polling is synchronous overhead.
- **No generic TUI readiness.** Full-screen programs have no standard way to
  signal "I am idle." The user must always specify what to look for.

## Prior Art

- **[Expect][expect]** — PTY-level pattern matching. Alternates `send`/`expect`
  on a PTY it owns. Same fundamental approach (text matching) but with direct
  PTY access instead of a tmux intermediary. Race conditions between send and
  program readiness are common — scripts embed `sleep` as workarounds.
- **[VHS][vhs]** — Frame capture via headless Chromium ([go-rod][go-rod]) +
  [xterm.js][xtermjs] canvas. Default 50fps (20ms frame interval). `Wait`
  command polls text content at 10ms. Heavyweight (browser dependency) but
  visually accurate.
- **[pexpect][pexpect]** — Python port of Expect. Adds `waitnoecho()` for ECHO
  flag detection (useful for password prompts, not general readiness).
- **`PROMPT_COMMAND` + `wait-for`** — Cooperative signaling through shell hooks.
  Reliable for shells, but requires injecting tmux commands.

[about]: ./about.md
[taxonomy]: ./terminal-programs.md
[modes]: ./terminal-modes.md
[pane-cc]: https://man7.org/linux/man-pages/man1/tmux.1.html#FORMATS
[sub]: https://github.com/tmux/tmux/wiki/Control-Mode
[capture-pane]:
  https://man7.org/linux/man-pages/man1/tmux.1.html#WINDOWS_AND_PANES
[control-mode]: https://github.com/tmux/tmux/wiki/Control-Mode
[waitfor]: https://github.com/tmux/tmux/blob/master/cmd-wait-for.c
[osc133]: https://gist.github.com/fdncred/c649b8ab3577a0e2873a8f229730e939
[shell-int]:
  https://learn.microsoft.com/en-us/windows/terminal/tutorials/shell-integration
[tmux-3064]: https://github.com/tmux/tmux/issues/3064
[omp]: https://github.com/JanDeDobbeleer/oh-my-posh
[fish]: https://fishshell.com/
[go-rod]: https://github.com/go-rod/rod
[expect]: https://linux.die.net/man/1/expect
[vhs]: https://github.com/charmbracelet/vhs
[xtermjs]: https://github.com/xtermjs/xterm.js
[pexpect]: https://pexpect.readthedocs.io/en/stable/
[yazi]: https://github.com/sxyazi/yazi
[lazysql]: https://github.com/jorgerojas26/lazysql
[pgcli]: https://github.com/dbcli/pgcli
[iredis]: https://github.com/laixintao/iredis
[harlequin]: https://github.com/tconbeer/harlequin
[irssi]: https://irssi.org/
