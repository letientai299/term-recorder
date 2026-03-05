import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeRecording } from "./execute.ts";
import { castContains } from "./test-helpers.ts";
import type { RecordOptions } from "./types.ts";

const fastOpts: RecordOptions = {
  mode: "headless",
  pace: 0,
  trailingDelay: 0,
  typingDelay: 0,
  actionDelay: 0,
  shell: "bash --norc --noprofile",
};

const castFiles: string[] = [];
let counter = 0;

function uniqueId(label: string): string {
  return `${label}-${process.pid}-${Date.now()}-${++counter}`;
}

function uniqueCast(label: string): string {
  const file = join(tmpdir(), `test-api-${uniqueId(label)}.cast`);
  castFiles.push(file);
  return file;
}

function testOpts(label: string): RecordOptions {
  return { ...fastOpts, sessionName: `t-${uniqueId(label)}` };
}

afterAll(() => {
  for (const f of castFiles) {
    if (existsSync(f)) unlinkSync(f);
  }
});

const TIMEOUT = 30_000;

describe("chainable API (e2e)", () => {
  test.concurrent(
    "send — literal text injection",
    async () => {
      const file = uniqueCast("send");
      await executeRecording(file, testOpts("send"), (s) => {
        s.send("echo hello-send\n");
        s.waitForText("hello-send");
      });
      expect(castContains(file, "hello-send")).toBe(true);
    },
    TIMEOUT,
  );

  test.concurrent(
    "type + enter — per-char typing",
    async () => {
      const file = uniqueCast("type");
      await executeRecording(file, testOpts("type"), (s) => {
        s.type("echo typed-text").enter();
        s.waitForText("typed-text");
      });
      expect(castContains(file, "typed-text")).toBe(true);
    },
    TIMEOUT,
  );

  test.concurrent(
    "key — Up arrow replays history",
    async () => {
      const file = uniqueCast("key-up");
      await executeRecording(file, testOpts("key-up"), (s) => {
        s.detectPrompt();
        s.reply("echo first-cmd");
        s.reply("echo second-cmd");
        s.key("Up", "Up").enter();
        s.waitForText("first-cmd");
      });
      expect(castContains(file, "first-cmd")).toBe(true);
    },
    TIMEOUT,
  );

  test.concurrent(
    "key — ctrl-c interrupts",
    async () => {
      const file = uniqueCast("key-ctrlc");
      await executeRecording(file, testOpts("key-ctrlc"), (s) => {
        s.run("sleep 99");
        s.sleep(300);
        s.key("ctrl-c");
        s.sleep(300);
        s.run("echo recovered");
        s.waitForText("recovered");
      });
      expect(castContains(file, "recovered")).toBe(true);
    },
    TIMEOUT,
  );

  test.concurrent(
    "run — type + enter shorthand",
    async () => {
      const file = uniqueCast("run");
      await executeRecording(file, testOpts("run"), (s) => {
        s.run("echo from-run");
        s.waitForText("from-run");
      });
      expect(castContains(file, "from-run")).toBe(true);
    },
    TIMEOUT,
  );

  test.concurrent(
    "detectPrompt + waitForPrompt",
    async () => {
      const file = uniqueCast("prompt");
      await executeRecording(file, testOpts("prompt"), (s) => {
        s.detectPrompt();
        s.run("echo detect-ok");
        s.waitForPrompt();
      });
      expect(castContains(file, "detect-ok")).toBe(true);
    },
    TIMEOUT,
  );

  test.concurrent(
    "reply — type + enter + waitForPrompt",
    async () => {
      const file = uniqueCast("reply");
      await executeRecording(file, testOpts("reply"), (s) => {
        s.detectPrompt();
        s.reply("echo reply-ok");
      });
      expect(castContains(file, "reply-ok")).toBe(true);
    },
    TIMEOUT,
  );

  test.concurrent(
    "waitForText — delayed appearance",
    async () => {
      const file = uniqueCast("waittext");
      await executeRecording(file, testOpts("waittext"), (s) => {
        s.run("sleep 0.2 && echo delayed-marker");
        s.waitForText("delayed-marker");
      });
      expect(castContains(file, "delayed-marker")).toBe(true);
    },
    TIMEOUT,
  );

  test.concurrent(
    "waitForTitle — terminal title change",
    async () => {
      const file = uniqueCast("title");
      await executeRecording(file, testOpts("title"), (s) => {
        s.run("printf '\\033]0;MY-TITLE\\007'");
        s.waitForTitle("MY-TITLE");
        s.run("echo title-done");
        s.waitForText("title-done");
      });
      expect(castContains(file, "title-done")).toBe(true);
    },
    TIMEOUT,
  );

  test.concurrent(
    "waitForIdle — output silence detection",
    async () => {
      const file = uniqueCast("idle");
      await executeRecording(file, testOpts("idle"), (s) => {
        s.run("echo idle-test");
        s.waitForIdle();
        s.run("echo after-idle");
        s.waitForText("after-idle");
      });
      expect(castContains(file, "after-idle")).toBe(true);
    },
    TIMEOUT,
  );

  test.concurrent(
    "sleep — fixed delay",
    async () => {
      const file = uniqueCast("sleep");
      await executeRecording(file, testOpts("sleep"), (s) => {
        s.sleep(50);
        s.run("echo after-sleep");
        s.waitForText("after-sleep");
      });
      expect(castContains(file, "after-sleep")).toBe(true);
    },
    TIMEOUT,
  );

  test.concurrent(
    "pace — per-pane delay (smoke)",
    async () => {
      const file = uniqueCast("pace");
      await executeRecording(file, testOpts("pace"), (s) => {
        s.pace(10);
        s.run("echo paced-ok");
        s.waitForText("paced-ok");
      });
      expect(castContains(file, "paced-ok")).toBe(true);
    },
    TIMEOUT,
  );

  test.concurrent(
    "splitH — horizontal split",
    async () => {
      const file = uniqueCast("splitH");
      await executeRecording(file, testOpts("splitH"), (s) => {
        // Run on main pane first to avoid tmux detach-on-destroy race
        s.run("echo main-ready");
        s.waitForText("main-ready");
        const right = s.splitH(50);
        right.run("echo from-right");
        right.waitForText("from-right");
      });
      expect(castContains(file, "from-right")).toBe(true);
    },
    TIMEOUT,
  );

  test.concurrent(
    "splitV — vertical split",
    async () => {
      const file = uniqueCast("splitV");
      await executeRecording(file, testOpts("splitV"), (s) => {
        s.run("echo main-ready");
        s.waitForText("main-ready");
        const bottom = s.splitV(50);
        bottom.run("echo from-bottom");
        bottom.waitForText("from-bottom");
      });
      expect(castContains(file, "from-bottom")).toBe(true);
    },
    TIMEOUT,
  );

  test.concurrent(
    "multi-pane interaction",
    async () => {
      const file = uniqueCast("multi");
      await executeRecording(file, testOpts("multi"), (s) => {
        s.run("echo main-pane");
        s.waitForText("main-pane");
        const right = s.splitH(50);
        right.run("echo split-pane");
        right.waitForText("split-pane");
      });
      expect(castContains(file, "main-pane")).toBe(true);
      expect(castContains(file, "split-pane")).toBe(true);
    },
    TIMEOUT,
  );
});
