/**
 * Micro-benchmarks comparing old vs new implementations for hot-path
 * optimizations in shell.ts and wait.ts.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function median(times: number[]): number {
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] ?? 0;
}

function bench(
  _label: string,
  fn: () => void,
  iterations: number,
  runs = 7,
): { medianMs: number; perIterUs: number } {
  const times: number[] = [];
  for (let r = 0; r < runs; r++) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) fn();
    times.push(performance.now() - start);
  }
  const med = median(times);
  return { medianMs: med, perIterUs: (med / iterations) * 1000 };
}

function report(
  _group: string,
  old: { medianMs: number; perIterUs: number },
  opt: { medianMs: number; perIterUs: number },
): void {
  const speedup = old.medianMs / opt.medianMs;
  console.log(
    `  old:  ${old.medianMs.toFixed(3)}ms  (${old.perIterUs.toFixed(3)}µs/iter)`,
  );
  console.log(
    `  new:  ${opt.medianMs.toFixed(3)}ms  (${opt.perIterUs.toFixed(3)}µs/iter)`,
  );
  console.log(`  speedup: ${speedup.toFixed(2)}x`);
  console.log();
}

// ---------------------------------------------------------------------------
// #2: handleOutput — regex vs indexOf
// ---------------------------------------------------------------------------

const OUTPUT_LINE = "%output %42 \\033[0mhello world output text here";
const N_OUTPUT = 100_000;

function handleOutputRegex(line: string): string {
  const match = line.match(/^%output (%\d+) /);
  if (!match) return "";
  return match[1] ?? "";
}

function handleOutputIndexOf(line: string): string {
  const paneStart = 8; // "%output ".length
  const spaceIdx = line.indexOf(" ", paneStart);
  if (spaceIdx < 0) return "";
  return line.slice(paneStart, spaceIdx);
}

console.log(`#2 handleOutput — regex vs indexOf (${N_OUTPUT} iterations)`);
const oldOutput = bench(
  "regex",
  () => handleOutputRegex(OUTPUT_LINE),
  N_OUTPUT,
);
const newOutput = bench(
  "indexOf",
  () => handleOutputIndexOf(OUTPUT_LINE),
  N_OUTPUT,
);
report("handleOutput", oldOutput, newOutput);

// ---------------------------------------------------------------------------
// #3: waitForPrompt — split+filter vs reverse scan
// ---------------------------------------------------------------------------

// Simulate realistic capture-pane output: ~30 lines, prompt on last line
const PANE_LINES: string[] = [];
for (let i = 0; i < 28; i++)
  PANE_LINES.push(`output line ${i} with some typical content`);
PANE_LINES.push(""); // empty line
PANE_LINES.push("user@host:~/project$ ");
const PANE_CONTENT = PANE_LINES.join("\n");
const PROMPT = "$";
const N_PROMPT = 100_000;

function promptSplitFilter(content: string, prompt: string): boolean {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  return (lines.at(-1) ?? "").includes(prompt);
}

function promptReverseScan(content: string, prompt: string): boolean {
  let end = content.length;
  for (;;) {
    while (end > 0 && content.charCodeAt(end - 1) <= 32) end--;
    if (end === 0) return false;
    const start = (content.lastIndexOf("\n", end - 1) + 1) | 0;
    const line = content.slice(start, end);
    if (line.trim().length > 0) return line.includes(prompt);
    end = start > 0 ? start - 1 : 0;
  }
}

console.log(
  `#3 waitForPrompt — split+filter vs reverse scan (${N_PROMPT} iterations)`,
);
const oldPrompt = bench(
  "split+filter",
  () => promptSplitFilter(PANE_CONTENT, PROMPT),
  N_PROMPT,
);
const newPrompt = bench(
  "reverse scan",
  () => promptReverseScan(PANE_CONTENT, PROMPT),
  N_PROMPT,
);
report("waitForPrompt", oldPrompt, newPrompt);

// ---------------------------------------------------------------------------
// #4: LineReader buffer split — split("\n") vs indexOf loop
// ---------------------------------------------------------------------------

// Simulate a chunk with multiple lines (typical tmux control mode output)
const CHUNK_LINES = [
  "%output %0 some terminal output here",
  "%output %0 more output from the process",
  "%begin 1234",
  "pane content line 1",
  "pane content line 2",
  "%end 1234",
  "%output %1 another pane output",
];
const CHUNK = `${CHUNK_LINES.join("\n")}\npartial`;
const N_LINE_READER = 100_000;

function splitApproach(buffer: string): { lines: string[]; remainder: string } {
  const parts = buffer.split("\n");
  const remainder = parts.pop() ?? "";
  return { lines: parts, remainder };
}

function indexOfApproach(buffer: string): {
  lines: string[];
  remainder: string;
} {
  const lines: string[] = [];
  let start = 0;
  let nlIdx = buffer.indexOf("\n", start);
  while (nlIdx >= 0) {
    lines.push(buffer.slice(start, nlIdx));
    start = nlIdx + 1;
    nlIdx = buffer.indexOf("\n", start);
  }
  return { lines, remainder: buffer.slice(start) };
}

console.log(
  `#4 LineReader split — split("\\n") vs indexOf loop (${N_LINE_READER} iterations)`,
);
const oldLR = bench("split", () => splitApproach(CHUNK), N_LINE_READER);
const newLR = bench("indexOf", () => indexOfApproach(CHUNK), N_LINE_READER);
report("LineReader", oldLR, newLR);

// ---------------------------------------------------------------------------
// Verify correctness
// ---------------------------------------------------------------------------

console.log("Correctness checks:");

const r1 = handleOutputRegex(OUTPUT_LINE);
const r2 = handleOutputIndexOf(OUTPUT_LINE);
console.log(`  handleOutput: regex=${r1}, indexOf=${r2}, match=${r1 === r2}`);

const p1 = promptSplitFilter(PANE_CONTENT, PROMPT);
const p2 = promptReverseScan(PANE_CONTENT, PROMPT);
console.log(`  waitForPrompt: split=${p1}, reverse=${p2}, match=${p1 === p2}`);

const s1 = splitApproach(CHUNK);
const s2 = indexOfApproach(CHUNK);
const linesMatch =
  s1.lines.length === s2.lines.length &&
  s1.lines.every((l, i) => l === s2.lines[i]);
console.log(
  `  LineReader: lines_match=${linesMatch}, remainder_match=${s1.remainder === s2.remainder}`,
);
