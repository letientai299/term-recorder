import type { Key } from "./keys.ts";
import { sendKey, sendKeys } from "./pane.ts";
import { splitPane } from "./session.ts";
import type { TmuxServer } from "./shell.ts";
import type { Action, ActionKind, ActionOf, Pane, Session } from "./types.ts";
import {
  detectPrompt,
  waitForIdle,
  waitForPrompt,
  waitForText,
  waitForTitle,
} from "./wait.ts";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface QueueConfig {
  typingDelay: number;
  actionDelay: number;
  headless: boolean;
  pace: number;
  /** Recording name shown in headless log lines. */
  recordingName?: string;
  /** Tmux session name stripped from pane targets in logs. */
  sessionName?: string;
}

function log(cfg: QueueConfig, msg: string): void {
  if (cfg.headless) {
    const tag = cfg.recordingName ?? "rec";
    console.log(`[${tag}] ${msg}`);
  }
}

let splitCounter = 0;

export function nextPlaceholder(): string {
  return `__split_${++splitCounter}__`;
}

export class ActionQueue {
  /** @internal */ actions: Action[] = [];
  /** Detected prompts keyed by pane target. */
  private prompts = new Map<string, string>();
  /** Per-pane minimum delay (ms) set via `pace()`. */
  private paces = new Map<string, number>();
  /** Current position during drain — used by resolvePlaceholder to skip already-executed actions. */
  private drainIndex = 0;

  constructor(
    private server: TmuxServer,
    private cfg: QueueConfig,
  ) {}

  push(action: Action): void {
    this.actions.push(action);
  }

  async drain(): Promise<void> {
    for (
      this.drainIndex = 0;
      this.drainIndex < this.actions.length;
      this.drainIndex++
    ) {
      const action = this.actions[this.drainIndex];
      if (!action) break;
      await this.execute(action, this.drainIndex, this.actions.length);
      // Auto-pause between actions (skip for sleep and pace)
      if (
        action.kind !== "sleep" &&
        action.kind !== "pace" &&
        action.kind !== "waitForIdle"
      ) {
        const pane = "pane" in action ? action.pane : undefined;
        const paceMs = pane ? (this.paces.get(pane) ?? this.cfg.pace) : 0;
        const delay = Math.max(this.cfg.actionDelay, paceMs);
        if (delay > 0) await sleep(delay);
      }
    }
    this.actions.length = 0;
    this.drainIndex = 0;
  }

  /** Replace placeholder targets in remaining queued actions with the actual pane_id. */
  private resolvePlaceholder(
    placeholder: string | undefined,
    paneId: string,
  ): void {
    if (!placeholder) return;
    for (let i = this.drainIndex + 1; i < this.actions.length; i++) {
      const a = this.actions[i];
      if (a && "pane" in a && a.pane === placeholder) {
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
      for (const name of a.names) {
        await sendKey(this.server, a.pane, name);
      }
    },
    enter: async (a) => {
      await sendKeys(this.server, a.pane, "\r", false);
    },
    sleep: async (a) => {
      await sleep(a.ms);
    },
    pace: async (a) => {
      this.paces.set(a.pane, a.ms);
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
    waitForIdle: async (a) => {
      await waitForIdle(this.server, a.pane, a.timeout);
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

  /** Strip the session name prefix from a pane/session target for shorter logs. */
  private shortTarget(raw: string): string {
    const prefix = this.cfg.sessionName;
    if (prefix && raw.startsWith(prefix)) return raw.slice(prefix.length);
    return raw;
  }

  private logAction(action: Action, index: number, total: number): void {
    const detail =
      "text" in action
        ? `"${action.text}"`
        : "names" in action
          ? action.names.join(" ")
          : "title" in action
            ? `"${action.title}"`
            : "ms" in action
              ? `${action.ms}ms`
              : "";
    const raw =
      "pane" in action
        ? action.pane
        : "session" in action
          ? action.session
          : "";
    const target = raw ? `→ ${this.shortTarget(raw)}` : "";
    const progress = `[${index + 1}/${total}]`;
    log(
      this.cfg,
      [progress, action.kind, detail, target].filter(Boolean).join(" "),
    );
  }

  private async execute(
    action: Action,
    index: number,
    total: number,
  ): Promise<void> {
    this.logAction(action, index, total);
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
    key(...names: Key[]) {
      queue.push({ kind: "key", pane: target, names });
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
    pace(ms: number) {
      queue.push({ kind: "pace", pane: target, ms });
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
    waitForIdle(timeout?: number) {
      queue.push({ kind: "waitForIdle", pane: target, timeout });
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
    splitH: (percent?: number) => split("splitH", percent),
    splitV: (percent?: number) => split("splitV", percent),
  };
  return api;
}
