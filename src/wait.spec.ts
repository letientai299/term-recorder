import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sendKeys } from "./pane.ts";
import { createSession, killSession } from "./session.ts";
import { TmuxServer } from "./shell.ts";
import { testSessionName } from "./test-helpers.test.ts";
import { exec, pollPane, waitForText } from "./wait.ts";

const server = new TmuxServer("test-wait");
const sessionName = testSessionName();

beforeAll(async () => {
  await createSession(server, sessionName);
  await pollPane(
    server,
    `${sessionName}:0.0`,
    (c) => c.trim().length > 0,
    5000,
    "shell ready",
  );
});

afterAll(async () => {
  await killSession(server, sessionName);
});

describe("waitForText", () => {
  test("resolves when text appears", async () => {
    const target = `${sessionName}:0.0`;
    await sendKeys(server, target, "echo MARKER_TEXT_123");
    await sendKeys(server, target, "\r", false);
    await waitForText(server, target, "MARKER_TEXT_123", 5000);
  });

  test("times out when text never appears", async () => {
    const target = `${sessionName}:0.0`;
    expect(
      waitForText(server, target, "NEVER_APPEARS_XYZ", 200),
    ).rejects.toThrow("timed out");
  });
});

describe("exec", () => {
  test("waits for command to complete", async () => {
    const target = `${sessionName}:0.0`;
    await exec(server, target, "echo EXEC_DONE", 5000);
  });
});
