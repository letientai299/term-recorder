import { afterEach, describe, expect, test } from "bun:test";
import {
  createSession,
  killSession,
  listPanes,
  splitPane,
} from "./session.ts";
import { TmuxServer } from "./shell.ts";
import { testSessionName } from "./test-helpers.test.ts";

const server = new TmuxServer("test-session");
let sessions: string[] = [];

afterEach(async () => {
  for (const name of sessions) {
    await killSession(server, name);
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
    await createSession(server, name, 80, 24);
    const panes = await listPanes(server, name);
    expect(panes).toHaveLength(1);
    expect(panes[0]).toBe("0");
  });

  test("split creates new pane", async () => {
    const name = tracked();
    await createSession(server, name, 100, 30);
    await splitPane(server, name, "h", 50);
    const panes = await listPanes(server, name);
    expect(panes).toHaveLength(2);
  });

  test("vertical split", async () => {
    const name = tracked();
    await createSession(server, name, 100, 30);
    await splitPane(server, name, "v", 50);
    const panes = await listPanes(server, name);
    expect(panes).toHaveLength(2);
  });

  test("kill non-existent session does not throw", async () => {
    await killSession(server, "nonexistent-session-12345");
  });
});
