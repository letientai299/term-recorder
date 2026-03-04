import { $ } from "bun";

/** Thrown when a tmux command exits with a non-zero status. */
export class TmuxError extends Error {
  constructor(
    public readonly args: string[],
    public readonly exitCode: number,
    public readonly stderr: string,
  ) {
    super(`tmux ${args.join(" ")} failed (exit ${exitCode}): ${stderr}`);
    this.name = "TmuxError";
  }
}

class StreamClosedError extends Error {
  constructor() {
    super("Control mode stream closed");
  }
}

/** Line-buffered reader over a ReadableStream. */
class LineReader {
  private buffer = "";
  private lines: string[] = [];
  private resolve?: () => void;
  private reject?: (err: Error) => void;
  private done = false;

  constructor(stream: ReadableStream<Uint8Array>) {
    this.pump(stream);
  }

  private pump(stream: ReadableStream<Uint8Array>): void {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const run = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          this.buffer += decoder.decode(value, { stream: true });
          const parts = this.buffer.split("\n");
          this.buffer = parts.pop() ?? "";
          for (const line of parts) {
            this.lines.push(line);
            this.resolve?.();
          }
        }
      } catch {
        // Stream closed or errored
      }
      this.done = true;
      this.reject?.(new StreamClosedError());
    };
    void run();
  }

  async nextLine(): Promise<string> {
    if (this.lines.length > 0) return this.lines.shift() ?? "";
    if (this.done) throw new StreamClosedError();
    await new Promise<void>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    if (this.lines.length === 0) throw new StreamClosedError();
    return this.lines.shift() ?? "";
  }
}

/**
 * Quote an argument for tmux control mode command parsing.
 *
 * Uses `{braces}` quoting (tmux 2.0+) which passes content verbatim.
 * Falls back to single-quote escaping for args containing `#{` format
 * sequences (braces suppress expansion) or unbalanced braces.
 */
/** @internal */
export function quoteCcArg(arg: string): string {
  if (arg.length === 0) return "''";

  // Flags starting with - must use single-quote escaping; tmux treats
  // {-flag} as a command block, not a quoted argument.
  if (arg.startsWith("-")) return `'${arg.replace(/'/g, "'\\''")}'`;

  const needsQuoting = /[\s"'\\#{}$;~]/.test(arg);
  if (!needsQuoting) return arg;

  // Format sequences like #{pane_id} must expand — braces suppress that.
  // Args with whitespace can't use braces — tmux tokenizes on spaces first.
  // Semicolons can't use braces — tmux parses {;} as a command block.
  const hasFormat = arg.includes("#{");
  const canBrace = !hasFormat && !/[\s;]/.test(arg);
  // Unbalanced braces can't use {braces} quoting
  const balanced =
    canBrace &&
    arg.split("").reduce((d, c) => (c === "{" ? d + 1 : c === "}" ? d - 1 : d), 0) === 0;

  if (canBrace && balanced) return `{${arg}}`;

  // Single-quote escape fallback
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * An isolated tmux server instance backed by a unique socket name.
 *
 * Each `TmuxServer` talks to its own tmux server process (`tmux -L <socketName>`),
 * so multiple recordings can run in parallel without interfering with each other
 * or the user's tmux sessions.
 *
 * After {@link connect}, commands are sent over tmux control mode (`-C`) — a
 * persistent stdin/stdout connection that avoids subprocess spawn per command.
 * Before `connect()` or after {@link disconnect}, commands fall back to
 * one-shot `tmux` subprocesses.
 *
 * Most users don't interact with this class directly — {@link main} and
 * {@link executeRecording} manage server lifecycle automatically.
 */
export class TmuxServer {
  private proc?: import("bun").Subprocess<"pipe", "pipe", "pipe">;
  private reader?: LineReader;
  private connected = false;
  private commandLock = Promise.resolve();

  /** Callbacks keyed by subscription name, invoked on %subscription-changed. */
  private subscriptions = new Map<string, Array<(value: string) => void>>();

  /**
   * @param socketName - Unique tmux socket name (passed as `tmux -L <name>`).
   * @param userConf - When true, load the user's `tmux.conf`. When false (default),
   *   start with `-f /dev/null` for a clean, reproducible environment.
   */
  constructor(
    readonly socketName: string,
    readonly userConf = false,
  ) {}

  /** Start a control mode connection attached to the given session. */
  async connect(sessionName: string): Promise<void> {
    const args = [
      "tmux",
      "-L",
      this.socketName,
      ...(this.userConf ? [] : ["-f", "/dev/null"]),
      "-C",
      "attach-session",
      "-t",
      sessionName,
    ];
    this.proc = Bun.spawn(args, {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    this.reader = new LineReader(this.proc.stdout);
    this.connected = true;
    await this.consumeInitialBlock();
  }

  /** Consume the initial %begin/%end block tmux sends on attach command. */
  private async consumeInitialBlock(): Promise<void> {
    let inBlock = false;
    while (true) {
      const line = await this.nextLine();
      if (!inBlock && line.startsWith("%begin ")) {
        inBlock = true;
        continue;
      }
      if (inBlock && (line.startsWith("%end ") || line.startsWith("%error "))) {
        return;
      }
    }
  }

  private async nextLine(): Promise<string> {
    if (!this.reader) throw new StreamClosedError();
    return this.reader.nextLine();
  }

  /** Send a command via control mode and await its response. Serialized via mutex. */
  private async controlCommand(...args: string[]): Promise<string> {
    let release!: () => void;
    const prev = this.commandLock;
    this.commandLock = new Promise((r) => {
      release = r;
    });
    try {
      await prev;
      return await this.controlCommandInner(...args);
    } finally {
      release();
    }
  }

  private async controlCommandInner(...args: string[]): Promise<string> {
    const cmd = args.map((a) => quoteCcArg(a)).join(" ");
    this.proc?.stdin.write(`${cmd}\n`);

    const output: string[] = [];
    let inBlock = false;
    while (true) {
      const line = await this.nextLine();
      if (!inBlock && line.startsWith("%subscription-changed ")) {
        // Format: %subscription-changed <name> <item> : <value>
        const rest = line.slice("%subscription-changed ".length);
        const spaceIdx = rest.indexOf(" ");
        if (spaceIdx >= 0) {
          const name = rest.slice(0, spaceIdx);
          const colonIdx = rest.indexOf(" : ", spaceIdx);
          const value = colonIdx >= 0 ? rest.slice(colonIdx + 3) : "";
          const cbs = this.subscriptions.get(name);
          if (cbs) for (const cb of [...cbs]) cb(value);
        }
        continue;
      }
      if (!inBlock && line.startsWith("%begin ")) {
        inBlock = true;
        continue;
      }
      if (inBlock && line.startsWith("%end ")) {
        return output.join("\n");
      }
      if (inBlock && line.startsWith("%error ")) {
        throw new TmuxError(args, 1, output.join("\n"));
      }
      if (inBlock) {
        output.push(line);
      }
    }
  }

  /**
   * Execute a tmux command and return its stdout.
   * Routes through control mode when connected, subprocess otherwise.
   * @param args - tmux sub-command and arguments (e.g. `"send-keys"`, `"-t"`, `"myPane"`, `"-l"`, `"hello"`).
   * @throws {TmuxError} if the command exits non-zero.
   */
  async tmux(...args: string[]): Promise<string> {
    if (this.connected) {
      return this.controlCommand(...args);
    }
    return this.subprocessCommand(...args);
  }

  /** Subprocess fallback for commands outside a control mode session. */
  private async subprocessCommand(...args: string[]): Promise<string> {
    const prefix: string[] = ["-L", this.socketName];
    if (!this.userConf) prefix.push("-f", "/dev/null");
    const fullArgs = [...prefix, ...args];
    const result = await $`tmux ${fullArgs}`.quiet().nothrow();
    if (result.exitCode !== 0) {
      throw new TmuxError(
        fullArgs,
        result.exitCode,
        result.stderr.toString().trim(),
      );
    }
    return result.stdout.toString().trim();
  }

  /**
   * Register a `refresh-client -B` subscription (tmux 3.1+).
   * The server will push `%subscription-changed` notifications when the
   * format value changes.
   */
  async subscribe(
    name: string,
    target: string,
    format: string,
  ): Promise<void> {
    if (!this.subscriptions.has(name)) this.subscriptions.set(name, []);
    await this.tmux("refresh-client", "-B", `${name}:${target}:${format}`);
  }

  /** Remove a subscription and discard its callbacks. */
  async unsubscribe(name: string): Promise<void> {
    this.subscriptions.delete(name);
    await this.tmux("refresh-client", "-B", `${name}:`);
  }

  /**
   * Returns a promise that resolves when a subscription notification
   * matches `predicate`, or rejects on timeout.
   */
  waitForSubscription(
    name: string,
    predicate: (value: string) => boolean,
    timeout: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `waitForSubscription("${name}") timed out after ${timeout}ms`,
          ),
        );
      }, timeout);

      const cleanup = () => {
        clearTimeout(timer);
        const cbs = this.subscriptions.get(name);
        if (cbs) {
          const idx = cbs.indexOf(cb);
          if (idx >= 0) cbs.splice(idx, 1);
        }
      };

      const cb = (value: string) => {
        if (predicate(value)) {
          cleanup();
          resolve();
        }
      };

      const arr = this.subscriptions.get(name) ?? [];
      arr.push(cb);
      this.subscriptions.set(name, arr);
    });
  }

  /** Detach from control mode. */
  async disconnect(): Promise<void> {
    if (!this.connected || !this.proc) return;
    this.connected = false;
    this.reader = undefined;
    const proc = this.proc;
    this.proc = undefined;

    try {
      proc.stdin.write("\n"); // detach
      proc.stdin.end();
    } catch {
      // stdin may already be closed
    }

    // Wait for process exit with a timeout, then force kill
    const exited = proc.exited;
    const timeout = new Promise<"timeout">((r) =>
      setTimeout(() => r("timeout"), 2000),
    );
    if ((await Promise.race([exited, timeout])) === "timeout") {
      proc.kill();
      await proc.exited;
    }
  }

  /** Kill the tmux server and clean up the socket. */
  async destroy(): Promise<void> {
    await this.disconnect();
    try {
      await this.subprocessCommand("kill-server");
    } catch {
      // Server may already be dead
    }
  }
}
