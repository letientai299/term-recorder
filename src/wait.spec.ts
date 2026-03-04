import { describe, expect, test } from "bun:test";
import { sendKeys } from "./pane.ts";
import { useTmuxSession } from "./test-helpers.ts";
import { exec, waitForText } from "./wait.ts";

const { server, target } = useTmuxSession("test-wait");

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
