import { describe, expect, test } from "bun:test";
import { capturePane, sendKeys } from "./pane.ts";
import { useTmuxSession } from "./test-helpers.ts";
import { exec, waitForText } from "./wait.ts";

const { server, target } = useTmuxSession("test-pane-wait");

describe("pane operations", () => {
  test("capturePane returns content", async () => {
    const content = await capturePane(server, target);
    expect(content).not.toBe("");
  });

  test("sendKeys and capturePane round-trip", async () => {
    await sendKeys(server, target, "echo hello-world");
    await sendKeys(server, target, "\r", false);
    await waitForText(server, target, "hello-world", 5000);
    const content = await capturePane(server, target);
    expect(content).toContain("hello-world");
  });
});

describe("waitForText", () => {
  test("resolves when text appears", async () => {
    await sendKeys(server, target, "echo MARKER_TEXT_123");
    await sendKeys(server, target, "\r", false);
    await waitForText(server, target, "MARKER_TEXT_123", 5000);
  });

  test("times out when text never appears", async () => {
    expect(
      waitForText(server, target, "NEVER_APPEARS_XYZ", 200),
    ).rejects.toThrow("timed out");
  });
});

describe("exec", () => {
  test("waits for command to complete", async () => {
    await exec(server, target, "echo EXEC_DONE", 5000);
  });
});
