import { describe, expect, test } from "bun:test";
import {
  ActionQueue,
  createPaneProxy,
  createSessionProxy,
} from "../src/queue.ts";

describe("ActionQueue", () => {
  test("queues actions without executing", () => {
    const queue = new ActionQueue("test-session");
    queue.push({ kind: "type", pane: "test:0.0", text: "hello" });
    queue.push({ kind: "enter", pane: "test:0.0" });
    expect(queue.actions).toHaveLength(2);
  });
});

describe("createPaneProxy", () => {
  test("queues type action", () => {
    const queue = new ActionQueue("test-session");
    const pane = createPaneProxy(queue, "test:0.0");
    pane.type("hello");
    expect(queue.actions).toHaveLength(1);
    expect(queue.actions[0]).toEqual({
      kind: "type",
      pane: "test:0.0",
      text: "hello",
    });
  });

  test("supports chaining", () => {
    const queue = new ActionQueue("test-session");
    const pane = createPaneProxy(queue, "test:0.0");
    pane.type("hello").enter().key("Up");
    expect(queue.actions).toHaveLength(3);
    expect(queue.actions[0]?.kind).toBe("type");
    expect(queue.actions[1]?.kind).toBe("enter");
    expect(queue.actions[2]?.kind).toBe("key");
  });

  test("queues exec with timeout", () => {
    const queue = new ActionQueue("test-session");
    const pane = createPaneProxy(queue, "test:0.0");
    pane.exec("ls -la", 5000);
    expect(queue.actions[0]).toEqual({
      kind: "exec",
      pane: "test:0.0",
      cmd: "ls -la",
      timeout: 5000,
    });
  });
});

describe("createSessionProxy", () => {
  test("has pane methods on default pane", () => {
    const queue = new ActionQueue("test-session");
    const session = createSessionProxy(queue, "test-session");
    session.type("hello").enter();
    expect(queue.actions).toHaveLength(2);
    expect(queue.actions[0]).toEqual({
      kind: "type",
      pane: "test-session:0.0",
      text: "hello",
    });
  });

  test("sleep queues sleep action", () => {
    const queue = new ActionQueue("test-session");
    const session = createSessionProxy(queue, "test-session");
    session.sleep(1000);
    expect(queue.actions[0]).toEqual({ kind: "sleep", ms: 1000 });
  });

  test("splitH returns a pane proxy for new pane", () => {
    const queue = new ActionQueue("test-session");
    const session = createSessionProxy(queue, "test-session");
    const pane2 = session.splitH(50);
    pane2.type("in pane 2");
    expect(queue.actions).toHaveLength(2);
    expect(queue.actions[0]).toEqual({
      kind: "splitH",
      session: "test-session",
      percent: 50,
    });
    expect(queue.actions[1]).toEqual({
      kind: "type",
      pane: "test-session:0.1",
      text: "in pane 2",
    });
  });
});
