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

/**
 * An isolated tmux server instance.
 * Each recording gets its own server, enabling concurrent execution.
 */
export class TmuxServer {
  constructor(
    readonly socketName: string,
    readonly userConf = false,
  ) {}

  /** Kill the tmux server and clean up the socket. */
  async destroy(): Promise<void> {
    try {
      await this.tmux("kill-server");
    } catch {
      // Server may already be dead
    }
  }

  async tmux(...args: string[]): Promise<string> {
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
}
