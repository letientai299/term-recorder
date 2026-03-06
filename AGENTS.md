# Agent Rules

Project-specific rules for AI agents working on this codebase.

## Documentation (docs/)

### Audience

Docs target contributors and occasional visitors who may not have deep terminal
knowledge. Don't assume familiarity with concepts like TTY, PTY, line
discipline, or termios.

### Terminology

- Define specialized terms on first use. Link to an authoritative reference
  (Wikipedia, man page, official docs).
- Use terms consistently across all docs. If a term is defined in one file,
  reference that definition rather than restating it differently.
- Don't call a program a "REPL" unless it truly follows the Read-Eval-Print Loop
  pattern (input blocked during evaluation). See
  [terminal-programs.md](docs/terminal-programs.md) for the taxonomy.

### Program names

- Use backticks for command names: `vim`, `tmux`, `irb`.
- Link non-standard programs to their homepage or GitHub repo on first mention
  in each file. "Non-standard" means anything not shipped by default on both
  Linux and macOS (e.g., `btop`, `yazi`, `pgcli`, `dialog`).
- Validate every link before adding it. Broken links are worse than no links.
- Product names (Claude Code, Codex CLI) don't need backticks — they're proper
  nouns, not commands.

### Cross-platform

- State which platforms a concept applies to. Don't assume POSIX everywhere.
- When a POSIX concept has a Windows equivalent, mention the mapping (e.g.,
  termios flags → `SetConsoleMode` flags).
- Note WSL compatibility when relevant — term-recorder's pipeline runs inside
  WSL's POSIX layer.

### Technical claims

- Verify claims about framework internals (terminal modes, flags, APIs) against
  source code or official docs. Don't rely on loose terminology — e.g., most TUI
  frameworks use true raw mode (ISIG disabled), not cbreak.
- When a claim applies to a specific version, say so. Note known version changes
  that affect behavior.

### Style

- Reference-style links, not inline. Keep lines short.
- Don't hardcode line numbers in source references — they drift. Link to
  function names or describe the code path.
- Format with prettier before committing.
