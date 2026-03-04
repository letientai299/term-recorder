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

export function castCols(header: CastHeader): number {
  return header.version === 3 ? header.term.cols : header.width;
}

export function castRows(header: CastHeader): number {
  return header.version === 3 ? header.term.rows : header.height;
}

/**
 * Parse an asciicast v2/v3 file (NDJSON format).
 */
export function parseCast(path: string): CastFile {
  const text = require("node:fs").readFileSync(path, "utf-8") as string;
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
 * Get the header of a cast file.
 */
export function castHeader(path: string): CastHeader {
  return parseCast(path).header;
}

/**
 * Generate a unique tmux session name for tests.
 */
export function testSessionName(): string {
  return `test-${process.pid}-${Date.now()}`;
}

/**
 * Set up an isolated tmux server for integration tests.
 * Call in beforeAll/afterAll to avoid hitting user's tmux.conf.
 */
export { initServer, resetServer } from "../src/shell.ts";
