import { afterAll, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { createSession, killSession } from "./session.ts";
import { TmuxServer } from "./shell.ts";
import { pollPane } from "./wait.ts";

interface CastHeaderV2 {
  version: 2;
  width: number;
  height: number;
  timestamp?: number;
  env?: Record<string, string>;
}

interface CastHeaderV3 {
  version: 3;
  term: { cols: number; rows: number; type?: string; version?: string };
  timestamp?: number;
  idle_time_limit?: number;
  command?: string;
  env?: Record<string, string>;
}

export type CastHeader = CastHeaderV2 | CastHeaderV3;

type CastEvent = [number, string, string]; // [time, type, data]

interface CastFile {
  header: CastHeader;
  events: CastEvent[];
}

/**
 * Parse an asciicast v2/v3 file (NDJSON format).
 */
export function parseCast(path: string): CastFile {
  const text = readFileSync(path, "utf-8");
  const lines = text.trim().split("\n");
  const firstLine = lines[0];
  if (!firstLine) throw new Error("Empty cast file");
  const header = JSON.parse(firstLine) as CastHeader;
  const events = lines.slice(1).map((line) => JSON.parse(line) as CastEvent);
  return { header, events };
}

/**
 * Check if a cast file contains the given text in its output events.
 */
export function castContains(path: string, text: string): boolean {
  const { events } = parseCast(path);
  const output = events
    .filter(([, type]) => type === "o")
    .map(([, , data]) => data)
    .join("");
  // Strip ANSI escape sequences for matching
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escapes requires matching \x1b
  const stripped = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  return stripped.includes(text);
}

/**
 * Get the header of a cast file without parsing all events.
 */
export function castHeader(path: string): CastHeader {
  const text = readFileSync(path, "utf-8");
  const firstLine = text.slice(0, text.indexOf("\n"));
  if (!firstLine) throw new Error("Empty cast file");
  return JSON.parse(firstLine) as CastHeader;
}

/**
 * Generate a unique tmux session name for tests.
 */
export function testSessionName(): string {
  return `test-${process.pid}-${Date.now()}`;
}

/**
 * Set up a tmux session with beforeAll/afterAll lifecycle hooks.
 * Returns the server, session name, and default pane target.
 */
export function useTmuxSession(socketName: string): {
  server: TmuxServer;
  sessionName: string;
  target: string;
} {
  const server = new TmuxServer(socketName);
  const sessionName = testSessionName();
  const target = `${sessionName}:0.0`;

  beforeAll(async () => {
    await createSession(server, sessionName);
    await pollPane(server, target, (c) => c.trim().length > 0, 5000, "shell ready");
  });

  afterAll(async () => {
    await killSession(server, sessionName);
  });

  return { server, sessionName, target };
}
