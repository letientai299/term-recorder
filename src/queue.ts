import type { Key } from "./keys.ts";
import { sendKey, sendKeys } from "./pane.ts";
import { splitPane } from "./session.ts";
import type { TmuxServer } from "./shell.ts";
import type { Action, ActionKind, ActionOf, Pane, Session } from "./types.ts";
import {
  detectPrompt,
  waitForPrompt,
  waitForText,
  waitForTitle,
} from "./wait.ts";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface QueueConfig {
  typingDelay: number;
  actionDelay: number;
  headless: boolean;
}

function log(cfg: QueueConfig, msg: string): void {
  if (cfg.headless) console.log(`[rec] ${msg}`);
}

let splitCounter = 0;

export function nextPlaceholder(): string {
  return `__split_${++splitCounter}__`;
}

export class ActionQueue {
  /** @internal */ actions: Action[] = [];
  /** Detected prompts keyed by pane target. */
  private prompts = new Map<string, string>();

  constructor(
    private server: TmuxServer,
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
        await sleep(this.cfg.actionDelay);
      }
    }
  }

  /** Replace placeholder targets in remaining queued actions with the actual pane_id. */
  private resolvePlaceholder(
    placeholder: string | undefined,
    paneId: string,
  ): void {
    if (!placeholder) return;
    for (const a of this.actions) {
      if ("pane" in a && a.pane === placeholder) {
        (a as { pane: string }).pane = paneId;
      }
    }
  }

  private handlers: { [K in ActionKind]: (a: ActionOf<K>) => Promise<void> } = {
    send: async (a) => {
      await sendKeys(this.server, a.pane, a.text);
    },
    type: async (a) => {
      const delay = a.delayMs ?? this.cfg.typingDelay;
      for (const char of a.text) {
        await sendKeys(this.server, a.pane, char);
        await sleep(delay);
      }
    },
    key: async (a) => {
      await sendKey(this.server, a.pane, a.name);
    },
    enter: async (a) => {
      await sendKeys(this.server, a.pane, "\r", false);
    },
    sleep: async (a) => {
      await sleep(a.ms);
    },
    waitForText: async (a) => {
      await waitForText(this.server, a.pane, a.text, a.timeout);
    },
    waitForPrompt: async (a) => {
      const prompt = a.prompt ?? this.prompts.get(a.pane);
      if (prompt == null) {
        throw new Error(
          `waitForPrompt on ${a.pane}: no prompt given and none detected — call detectPrompt() first`,
        );
      }
      await waitForPrompt(this.server, a.pane, prompt, a.timeout);
    },
    detectPrompt: async (a) => {
      const detected = await detectPrompt(this.server, a.pane, a.timeout);
      this.prompts.set(a.pane, detected);
    },
    waitForTitle: async (a) => {
      await waitForTitle(this.server, a.pane, a.title, a.timeout);
    },
    splitV: async (a) => {
      const id = await splitPane(this.server, a.session, "v", a.percent);
      this.resolvePlaceholder(a.placeholder, id.trim());
    },
    splitH: async (a) => {
      const id = await splitPane(this.server, a.session, "h", a.percent);
      this.resolvePlaceholder(a.placeholder, id.trim());
    },
  };

  private logAction(action: Action): void {
    const detail =
      "text" in action
        ? `"${action.text}"`
        : "name" in action
          ? action.name
          : "title" in action
            ? `"${action.title}"`
            : "ms" in action
              ? `${action.ms}ms`
              : "";
    const target =
      "pane" in action
        ? `→ ${action.pane}`
        : "session" in action
          ? `→ ${action.session}`
          : "";
    log(this.cfg, [action.kind, detail, target].filter(Boolean).join(" "));
  }

  private async execute(action: Action): Promise<void> {
    this.logAction(action);
    const handler = this.handlers[action.kind];
    await (handler as (a: Action) => Promise<void>)(action);
  }
}

export function createPaneProxy(queue: ActionQueue, target: string): Pane {
  const api: Pane = {
    send(text: string) {
      queue.push({ kind: "send", pane: target, text });
      return api;
    },
    type(text: string, delayMs?: number) {
      queue.push({ kind: "type", pane: target, text, delayMs });
      return api;
    },
    key(name: Key) {
      queue.push({ kind: "key", pane: target, name });
      return api;
    },
    enter() {
      queue.push({ kind: "enter", pane: target });
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
    waitForPrompt(prompt?: string, timeout?: number) {
      queue.push({ kind: "waitForPrompt", pane: target, prompt, timeout });
      return api;
    },
    detectPrompt(timeout?: number) {
      queue.push({ kind: "detectPrompt", pane: target, timeout });
      return api;
    },
    waitForTitle(title: string, timeout?: number) {
      queue.push({ kind: "waitForTitle", pane: target, title, timeout });
      return api;
    },
    run(text: string) {
      queue.push({ kind: "type", pane: target, text });
      queue.push({ kind: "enter", pane: target });
      return api;
    },
    reply(text: string, timeout?: number) {
      queue.push({ kind: "type", pane: target, text });
      queue.push({ kind: "enter", pane: target });
      queue.push({ kind: "waitForPrompt", pane: target, timeout });
      return api;
    },
    pause(ms?: number) {
      queue.push({ kind: "sleep", ms: ms ?? 1000 });
      return api;
    },
  };
  return api;
}

export function createSessionProxy(
  queue: ActionQueue,
  sessionName: string,
): Session {
  const defaultTarget = `${sessionName}:0.0`;
  const pane = createPaneProxy(queue, defaultTarget);

  function split(kind: "splitH" | "splitV", percent?: number): Pane {
    const placeholder = nextPlaceholder();
    queue.push({ kind, session: sessionName, percent, placeholder });
    return createPaneProxy(queue, placeholder);
  }

  const api: Session = {
    ...pane,
    sleep(ms: number) {
      queue.push({ kind: "sleep", ms });
      return api;
    },
    run(text: string) {
      queue.push({ kind: "type", pane: defaultTarget, text });
      queue.push({ kind: "enter", pane: defaultTarget });
      return api;
    },
    reply(text: string, timeout?: number) {
      queue.push({ kind: "type", pane: defaultTarget, text });
      queue.push({ kind: "enter", pane: defaultTarget });
      queue.push({ kind: "waitForPrompt", pane: defaultTarget, timeout });
      return api;
    },
    pause(ms?: number) {
      queue.push({ kind: "sleep", ms: ms ?? 1000 });
      return api;
    },
    splitH: (percent?: number) => split("splitH", percent),
    splitV: (percent?: number) => split("splitV", percent),
  };
  return api;
}
