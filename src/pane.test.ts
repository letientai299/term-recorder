import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { capturePane, sendKeys } from "./pane.ts";
import { createSession, killSession } from "./session.ts";
import { initServer, resetServer, testSessionName } from "./test-helpers.ts";

let sessionName: string;

beforeAll(() => initServer("test-pane"));
afterAll(() => resetServer());

beforeEach(async () => {
  sessionName = testSessionName();
  await createSession(sessionName, 80, 24);
});

afterEach(async () => {
  await killSession(sessionName);
});

describe("pane operations", () => {
  test("sendKeys and capturePane round-trip", async () => {
    const target = `${sessionName}:0.0`;
    await sendKeys(target, "echo hello-world");
    await sendKeys(target, "\r", false);
    await Bun.sleep(500);
    const content = await capturePane(target);
    expect(content).toContain("hello-world");
  });

  test("capturePane returns content", async () => {
    const target = `${sessionName}:0.0`;
    // Shell prompt should be visible
    await Bun.sleep(300);
    const content = await capturePane(target);
    expect(content.length).toBeGreaterThan(0);
  });
});
