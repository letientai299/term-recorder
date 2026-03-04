import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { sendKeys } from "./pane.ts";
import { createSession, killSession } from "./session.ts";
import { TmuxServer } from "./shell.ts";
import { testSessionName } from "./test-helpers.test.ts";
import { exec, waitForText } from "./wait.ts";

const server = new TmuxServer("test-wait");
let sessionName: string;

beforeEach(async () => {
  sessionName = testSessionName();
  await createSession(server, sessionName);
  // Wait for shell to be ready
  await Bun.sleep(500);
});

afterEach(async () => {
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
      waitForText(server, target, "NEVER_APPEARS_XYZ", 1000),
    ).rejects.toThrow("timed out");
  });
});

describe("exec", () => {
  test("waits for command to complete", async () => {
    const target = `${sessionName}:0.0`;
    await exec(server, target, "echo EXEC_DONE", 5000);
    // If we get here without timeout, exec worked
  });
});
