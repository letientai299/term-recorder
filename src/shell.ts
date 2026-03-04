import { $ } from "bun";

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

/**
 * An isolated tmux server instance.
 *
 * Uses tmux control mode (-C) for a persistent stdin/stdout connection,
 * avoiding a subprocess spawn per command. Falls back to subprocess for
 * commands issued before connect() or after disconnect.
 */
export class TmuxServer {
  private proc?: ReturnType<typeof Bun.spawn>;
  private lineBuffer = "";
  private lines: string[] = [];
  private lineResolve?: () => void;
  private lineReject?: (err: Error) => void;
  private connected = false;
  private streamDone = false;
  private commandLock = Promise.resolve();

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
    this.streamDone = false;
    this.startReading();
    this.connected = true;
    // Consume the initial %begin/%end block tmux sends on connect
    await this.consumeInitialBlock();
  }

  private startReading(): void {
    const reader = this.proc?.stdout.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          this.lineBuffer += decoder.decode(value, { stream: true });
          const parts = this.lineBuffer.split("\n");
          // Last element is incomplete — keep it in buffer
          this.lineBuffer = parts.pop() ?? "";
          for (const line of parts) {
            this.lines.push(line);
            this.lineResolve?.();
          }
        }
      } catch {
        // Stream closed or errored
      }
      // Signal any pending nextLine() that the stream is done
      this.streamDone = true;
      this.lineReject?.(new StreamClosedError());
    };
    pump();
  }

  private async nextLine(): Promise<string> {
    if (this.lines.length > 0) {
      return this.lines.shift() ?? "";
    }
    if (this.streamDone) throw new StreamClosedError();
    await new Promise<void>((resolve, reject) => {
      this.lineResolve = resolve;
      this.lineReject = reject;
    });
    if (this.lines.length === 0) throw new StreamClosedError();
    return this.lines.shift() ?? "";
  }

  /** Consume the initial %begin/%end block tmux sends on attach. */
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
      // Skip notifications and content lines
    }
  }

  /**
   * Quote an argument for tmux control mode command parsing.
   * Args containing spaces, special chars, or tmux format sequences
   * must be wrapped in single quotes with internal quotes escaped.
   */
  private quoteCcArg(arg: string): string {
    // Empty string needs quoting
    if (arg.length === 0) return "''";
    // If it contains characters that need quoting, wrap in single quotes
    if (/[\s"'\\#{}$;~]/.test(arg) || arg.startsWith("-")) {
      return `'${arg.replace(/'/g, "'\\''")}'`;
    }
    return arg;
  }

  /** Send a command via control mode and await its response. Serialized via mutex. */
  private controlCommand(...args: string[]): Promise<string> {
    let release: () => void;
    const prev = this.commandLock;
    this.commandLock = new Promise((r) => {
      release = r;
    });
    return prev.then(() => this.controlCommandInner(...args)).finally(() => release!());
  }

  private async controlCommandInner(...args: string[]): Promise<string> {
    const cmd = args.map((a) => this.quoteCcArg(a)).join(" ");
    this.proc?.stdin.write(`${cmd}\n`);

    // Read lines until we find %begin, then collect until %end or %error
    const output: string[] = [];
    let inBlock = false;
    while (true) {
      const line = await this.nextLine();
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
      // Skip notifications outside blocks (%output, %window-add, etc.)
    }
  }

  /** Execute a tmux command. Uses control mode if connected, subprocess otherwise. */
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

  /** Detach from control mode. */
  async disconnect(): Promise<void> {
    if (!this.connected || !this.proc) return;
    this.connected = false;
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
