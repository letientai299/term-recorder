import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sendKeys } from "../src/pane.ts";
import { createSession, killSession } from "../src/session.ts";
import { exec, waitForText } from "../src/wait.ts";
import { initServer, resetServer, testSessionName } from "./helpers.ts";

let sessionName: string;

beforeAll(() => initServer("test-wait"));
afterAll(() => resetServer());

beforeEach(async () => {
  sessionName = testSessionName();
  await createSession(sessionName, 80, 24);
  // Wait for shell to be ready
  await Bun.sleep(500);
});

afterEach(async () => {
  await killSession(sessionName);
});

describe("waitForText", () => {
  test("resolves when text appears", async () => {
    const target = `${sessionName}:0.0`;
    await sendKeys(target, "echo MARKER_TEXT_123");
    await sendKeys(target, "\r", false);
    await waitForText(target, "MARKER_TEXT_123", 5000);
  });

  test("times out when text never appears", async () => {
    const target = `${sessionName}:0.0`;
    await expect(
      waitForText(target, "NEVER_APPEARS_XYZ", 1000),
    ).rejects.toThrow("timed out");
  });
});

describe("exec", () => {
  test("waits for command to complete", async () => {
    const target = `${sessionName}:0.0`;
    await exec(target, "echo EXEC_DONE", 5000);
    // If we get here without timeout, exec worked
  });
});
