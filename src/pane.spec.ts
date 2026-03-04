import { describe, expect, test } from "bun:test";
import { capturePane, sendKeys } from "./pane.ts";
import { useTmuxSession } from "./test-helpers.ts";
import { waitForText } from "./wait.ts";

const { server, target } = useTmuxSession("test-pane");

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
