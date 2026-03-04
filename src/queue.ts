import { sendKey, sendKeys } from "./pane.ts";
import { splitPane } from "./session.ts";
import {
  DEFAULT_ACTION_DELAY_MS,
  DEFAULT_TYPING_DELAY_MS,
  type Action,
  type PaneApi,
  type SessionApi,
} from "./types.ts";
import { exec, waitForPrompt, waitForText } from "./wait.ts";

export interface QueueConfig {
  typingDelay: number;
  actionDelay: number;
  headless: boolean;
}

function log(cfg: QueueConfig, msg: string): void {
  if (cfg.headless) console.log(`[rec] ${msg}`);
}

export class ActionQueue {
  /** @internal */ actions: Action[] = [];
  /** @internal */ paneCount = 0;

  constructor(
    private sessionName: string,
    private cfg: QueueConfig,
  ) {}

  push(action: Action): void {
    this.actions.push(action);
  }

  async drain(): Promise<void> {
    while (this.actions.length > 0) {
      const action = this.actions.shift();
      if (!action) break;
      await this.execute(action);
      // Auto-pause between actions (skip for sleep — already a pause)
      if (action.kind !== "sleep" && this.cfg.actionDelay > 0) {
        await Bun.sleep(this.cfg.actionDelay);
      }
    }
  }

  private async execute(action: Action): Promise<void> {
    switch (action.kind) {
      case "type":
        log(this.cfg, `type "${action.text}" → ${action.pane}`);
        await sendKeys(action.pane, action.text);
        break;
      case "typeHuman": {
        const delay = action.delayMs ?? this.cfg.typingDelay;
        log(this.cfg, `typeHuman "${action.text}" (${delay}ms/char) → ${action.pane}`);
        for (const char of action.text) {
          await sendKeys(action.pane, char);
          const jitter = delay * (0.6 + Math.random() * 0.8);
          await Bun.sleep(jitter);
        }
        break;
      }
      case "key":
        log(this.cfg, `key ${action.name} → ${action.pane}`);
        await sendKey(action.pane, action.name);
        break;
      case "enter":
        log(this.cfg, `enter → ${action.pane}`);
        await sendKeys(action.pane, "\r", false);
        break;
      case "exec":
        log(this.cfg, `exec "${action.cmd}" → ${action.pane}`);
        await exec(action.pane, action.cmd, action.timeout);
        log(this.cfg, `exec done`);
        break;
      case "sleep":
        log(this.cfg, `sleep ${action.ms}ms`);
        await Bun.sleep(action.ms);
        break;
      case "waitForText":
        log(this.cfg, `waitForText "${action.text}" → ${action.pane}`);
        await waitForText(action.pane, action.text, action.timeout);
        log(this.cfg, `waitForText found`);
        break;
      case "waitForPrompt":
        log(this.cfg, `waitForPrompt "${action.prompt}" → ${action.pane}`);
        await waitForPrompt(action.pane, action.prompt, action.timeout);
        log(this.cfg, `waitForPrompt found`);
        break;
      case "splitH": {
        log(this.cfg, `splitH ${action.percent ?? ""}% → ${action.session}`);
        await splitPane(action.session, "h", action.percent);
        this.paneCount++;
        this._lastSplitPaneTarget = `${this.sessionName}:0.${this.paneCount}`;
        break;
      }
      case "splitV": {
        log(this.cfg, `splitV ${action.percent ?? ""}% → ${action.session}`);
        await splitPane(action.session, "v", action.percent);
        this.paneCount++;
        this._lastSplitPaneTarget = `${this.sessionName}:0.${this.paneCount}`;
        break;
      }
    }
  }

  _lastSplitPaneTarget = "";
}

export function createPaneProxy(queue: ActionQueue, target: string): PaneApi {
  const api: PaneApi = {
    type(text: string) {
      queue.push({ kind: "type", pane: target, text });
      return api;
    },
    typeHuman(text: string, delayMs?: number) {
      queue.push({ kind: "typeHuman", pane: target, text, delayMs });
      return api;
    },
    key(name: string) {
      queue.push({ kind: "key", pane: target, name });
      return api;
    },
    enter() {
      queue.push({ kind: "enter", pane: target });
      return api;
    },
    exec(cmd: string, timeout?: number) {
      queue.push({ kind: "exec", pane: target, cmd, timeout });
      return api;
    },
    sleep(ms: number) {
      queue.push({ kind: "sleep", ms });
      return api;
    },
    waitForText(text: string, timeout?: number) {
      queue.push({ kind: "waitForText", pane: target, text, timeout });
      return api;
    },
    waitForPrompt(prompt: string, timeout?: number) {
      queue.push({ kind: "waitForPrompt", pane: target, prompt, timeout });
      return api;
    },
  };
  return api;
}

export function createSessionProxy(
  queue: ActionQueue,
  sessionName: string,
): SessionApi {
  const defaultTarget = `${sessionName}:0.0`;
  const pane = createPaneProxy(queue, defaultTarget);

  const api: SessionApi = {
    ...pane,
    sleep(ms: number) {
      queue.push({ kind: "sleep", ms });
      return api;
    },
    splitH(percent?: number): PaneApi {
      queue.push({ kind: "splitH", session: sessionName, percent });
      const pendingSplits = queue.actions.filter(
        (a) => a.kind === "splitH" || a.kind === "splitV",
      ).length;
      const predictedIndex = queue.paneCount + pendingSplits;
      return createPaneProxy(queue, `${sessionName}:0.${predictedIndex}`);
    },
    splitV(percent?: number): PaneApi {
      queue.push({ kind: "splitV", session: sessionName, percent });
      const pendingSplits = queue.actions.filter(
        (a) => a.kind === "splitH" || a.kind === "splitV",
      ).length;
      const predictedIndex = queue.paneCount + pendingSplits;
      return createPaneProxy(queue, `${sessionName}:0.${predictedIndex}`);
    },
  };
  return api;
}
