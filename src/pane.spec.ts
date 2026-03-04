import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { capturePane, sendKeys } from "./pane.ts";
import { createSession, killSession } from "./session.ts";
import { TmuxServer } from "./shell.ts";
import { testSessionName } from "./test-helpers.test.ts";
import { pollPane, waitForText } from "./wait.ts";

const server = new TmuxServer("test-pane");
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

describe("pane operations", () => {
  test("capturePane returns content", async () => {
    const target = `${sessionName}:0.0`;
    const content = await capturePane(server, target);
    expect(content.length).toBeGreaterThan(0);
  });

  test("sendKeys and capturePane round-trip", async () => {
    const target = `${sessionName}:0.0`;
    await sendKeys(server, target, "echo hello-world");
    await sendKeys(server, target, "\r", false);
    await waitForText(server, target, "hello-world", 5000);
    const content = await capturePane(server, target);
    expect(content).toContain("hello-world");
  });
});
