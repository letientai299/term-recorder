import { describe, expect, test } from "bun:test";
import { ActionQueue, createPaneProxy, createSessionProxy } from "./queue.ts";
import { TmuxServer } from "./shell.ts";
import type { ActionOf } from "./types.ts";

const server = new TmuxServer("test-queue-dummy");
const cfg = { typingDelay: 100, actionDelay: 0, headless: false, pace: 0 };

describe("ActionQueue", () => {
  test("queues actions without executing", () => {
    const queue = new ActionQueue(server, cfg);
    queue.push({ kind: "type", pane: "test:0.0", text: "hello" });
    queue.push({ kind: "enter", pane: "test:0.0" });
    expect(queue.actions).toHaveLength(2);
  });
});

describe("createPaneProxy", () => {
  test("queues send action", () => {
    const queue = new ActionQueue(server, cfg);
    const pane = createPaneProxy(queue, "test:0.0");
    pane.send("hello");
    expect(queue.actions).toHaveLength(1);
    expect(queue.actions[0]).toEqual({
      kind: "send",
      pane: "test:0.0",
      text: "hello",
    });
  });

  test("queues pace action", () => {
    const queue = new ActionQueue(server, cfg);
    const pane = createPaneProxy(queue, "test:0.0");
    pane.pace(500);
    expect(queue.actions).toHaveLength(1);
    expect(queue.actions[0]).toEqual({
      kind: "pace",
      pane: "test:0.0",
      ms: 500,
    });
  });

  test("supports chaining", () => {
    const queue = new ActionQueue(server, cfg);
    const pane = createPaneProxy(queue, "test:0.0");
    pane.send("hello").enter().key("Up");
    expect(queue.actions).toMatchObject([
      { kind: "send" },
      { kind: "enter" },
      { kind: "key" },
    ]);
  });
});

describe("createSessionProxy", () => {
  test("has pane methods on default pane", () => {
    const queue = new ActionQueue(server, cfg);
    const session = createSessionProxy(queue, "test-session");
    session.send("hello").enter();
    expect(queue.actions).toHaveLength(2);
    expect(queue.actions[0]).toEqual({
      kind: "send",
      pane: "test-session:0.0",
      text: "hello",
    });
  });

  test("sleep queues sleep action", () => {
    const queue = new ActionQueue(server, cfg);
    const session = createSessionProxy(queue, "test-session");
    session.sleep(1000);
    expect(queue.actions[0]).toEqual({ kind: "sleep", ms: 1000 });
  });

  test("splitH returns a pane proxy with placeholder target", () => {
    const queue = new ActionQueue(server, cfg);
    const session = createSessionProxy(queue, "test-session");
    const pane2 = session.splitH(50);
    pane2.send("in pane 2");
    expect(queue.actions).toHaveLength(2);
    const split = queue.actions[0] as ActionOf<"splitH">;
    expect(split.kind).toBe("splitH");
    expect(split.kind).not.toBe("splitV");
    expect(split.session).toBe("test-session");
    expect(split.percent).toBe(50);
    expect(split.placeholder).toBeString();
    // The send action targets the same placeholder — resolved at drain time
    const sendAction = queue.actions[1] as ActionOf<"send">;
    expect(sendAction.pane).toBe(split.placeholder as string);
    expect(sendAction.text).toBe("in pane 2");
  });
});
