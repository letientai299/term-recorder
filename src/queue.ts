import { sendKey, sendKeys } from "./pane.ts";
import { splitPane } from "./session.ts";
import type { Action, PaneApi, SessionApi } from "./types.ts";
import { exec, waitForPrompt, waitForText } from "./wait.ts";

export class ActionQueue {
  /** @internal */ actions: Action[] = [];
  /** @internal */ paneCount = 0;

  constructor(private sessionName: string) {}

  push(action: Action): void {
    this.actions.push(action);
  }

  async drain(): Promise<void> {
    while (this.actions.length > 0) {
      const action = this.actions.shift();
      if (!action) break;
      await this.execute(action);
    }
  }

  private async execute(action: Action): Promise<void> {
    switch (action.kind) {
      case "type":
        await sendKeys(action.pane, action.text);
        break;
      case "typeHuman": {
        const delay = action.delayMs ?? 80;
        for (const char of action.text) {
          await sendKeys(action.pane, char);
          // Jitter ±40% for natural feel
          const jitter = delay * (0.6 + Math.random() * 0.8);
          await Bun.sleep(jitter);
        }
        break;
      }
      case "key":
        await sendKey(action.pane, action.name);
        break;
      case "enter":
        await sendKeys(action.pane, "\r", false);
        break;
      case "exec":
        await exec(action.pane, action.cmd, action.timeout);
        break;
      case "sleep":
        await Bun.sleep(action.ms);
        break;
      case "waitForText":
        await waitForText(action.pane, action.text, action.timeout);
        break;
      case "waitForPrompt":
        await waitForPrompt(action.pane, action.prompt, action.timeout);
        break;
      case "splitH": {
        const paneId = await splitPane(action.session, "h", action.percent);
        this.paneCount++;
        // Store the pane ID for the proxy that triggered this
        this._lastSplitPaneTarget = `${this.sessionName}:0.${this.paneCount}`;
        this._lastSplitPaneId = paneId;
        break;
      }
      case "splitV": {
        const paneId = await splitPane(action.session, "v", action.percent);
        this.paneCount++;
        this._lastSplitPaneTarget = `${this.sessionName}:0.${this.paneCount}`;
        this._lastSplitPaneId = paneId;
        break;
      }
    }
  }

  // Used by split operations to pass pane info back
  _lastSplitPaneTarget = "";
  _lastSplitPaneId = "";
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
      // We need to return a pane proxy for the new pane.
      // Since splits execute during drain(), we predict the next pane index.
      const _nextIndex = queue.paneCount + 1;
      // Count pending split actions to predict the pane index at drain time
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
