import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { capturePane, sendKeys } from "./pane.ts";
import { createSession, killSession } from "./session.ts";
import { TmuxServer } from "./shell.ts";
import { testSessionName } from "./test-helpers.test.ts";

const server = new TmuxServer("test-pane");
let sessionName: string;

beforeEach(async () => {
  sessionName = testSessionName();
  await createSession(server, sessionName, 80, 24);
});

afterEach(async () => {
  await killSession(server, sessionName);
});

describe("pane operations", () => {
  test("sendKeys and capturePane round-trip", async () => {
    const target = `${sessionName}:0.0`;
    await sendKeys(server, target, "echo hello-world");
    await sendKeys(server, target, "\r", false);
    await Bun.sleep(500);
    const content = await capturePane(server, target);
    expect(content).toContain("hello-world");
  });

  test("capturePane returns content", async () => {
    const target = `${sessionName}:0.0`;
    // Shell prompt should be visible
    await Bun.sleep(300);
    const content = await capturePane(server, target);
    expect(content.length).toBeGreaterThan(0);
  });
});
