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

/** Socket name for an isolated tmux server. */
let socketName: string | undefined;
/** Whether to load user's tmux.conf. */
let useUserConf = false;

/**
 * Initialize a dedicated tmux server.
 * When userConf is false (default), passes -f /dev/null to ignore user config.
 */
export function initServer(name: string, userConf = false): string {
  socketName = name;
  useUserConf = userConf;
  return socketName;
}

/** Reset the server socket (for cleanup). */
export function resetServer(): void {
  socketName = undefined;
  useUserConf = false;
}

export function getSocketName(): string | undefined {
  return socketName;
}

export function isUserConf(): boolean {
  return useUserConf;
}

export async function tmux(...args: string[]): Promise<string> {
  const prefix: string[] = [];
  if (socketName) {
    prefix.push("-L", socketName);
    if (!useUserConf) prefix.push("-f", "/dev/null");
  }
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
