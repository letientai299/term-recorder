import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import {
  createSession,
  killSession,
  listPanes,
  splitPane,
} from "./session.ts";
import { initServer, resetServer, testSessionName } from "./test-helpers.ts";

let sessions: string[] = [];

beforeAll(() => initServer("test-session"));
afterAll(() => resetServer());

afterEach(async () => {
  for (const name of sessions) {
    await killSession(name);
  }
  sessions = [];
});

function tracked(): string {
  const name = testSessionName();
  sessions.push(name);
  return name;
}

describe("session lifecycle", () => {
  test("create and kill session", async () => {
    const name = tracked();
    await createSession(name, 80, 24);
    const panes = await listPanes(name);
    expect(panes).toHaveLength(1);
    expect(panes[0]).toBe("0");
  });

  test("split creates new pane", async () => {
    const name = tracked();
    await createSession(name, 100, 30);
    await splitPane(name, "h", 50);
    const panes = await listPanes(name);
    expect(panes).toHaveLength(2);
  });

  test("vertical split", async () => {
    const name = tracked();
    await createSession(name, 100, 30);
    await splitPane(name, "v", 50);
    const panes = await listPanes(name);
    expect(panes).toHaveLength(2);
  });

  test("kill non-existent session does not throw", async () => {
    await killSession("nonexistent-session-12345");
  });
});
