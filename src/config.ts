export interface Config {
  cols?: number;
  rows?: number;
  idleTimeLimit?: number;
  mode?: "headful" | "headless";
  shell?: string;
  typingDelay?: number;
  actionDelay?: number;
  userTmuxConf?: boolean;
  userAsciinemaConf?: boolean;
  outputDir?: string;
  tmux?: { options?: Record<string, string> };
  env?: Record<string, string>;
  cwd?: string;
}

/** Identity function for type inference on config objects. */
export function defineConfig(config: Config): Config {
  return config;
}
