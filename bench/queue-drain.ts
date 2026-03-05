import { ActionQueue, type QueueConfig } from "../src/queue.ts";
import type { TmuxServer } from "../src/shell.ts";
import type { Action } from "../src/types.ts";

const mockServer = { tmux: async () => "" } as unknown as TmuxServer;

const cfg: QueueConfig = {
  typingDelay: 0,
  actionDelay: 0,
  headless: false,
  pace: 0,
};

function buildActions(n: number): Action[] {
  const actions: Action[] = [];
  for (let i = 0; i < n; i++) {
    actions.push({ kind: "send", pane: "bench:0.0", text: `line ${i}` });
  }
  return actions;
}

async function bench(label: string, n: number, runs = 5): Promise<void> {
  const times: number[] = [];
  for (let r = 0; r < runs; r++) {
    const queue = new ActionQueue(mockServer, cfg);
    const actions = buildActions(n);
    for (const a of actions) queue.push(a);

    const start = performance.now();
    await queue.drain();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)] ?? 0;
  const perAction = (median / n) * 1000; // microseconds
  console.log(
    `${label.padEnd(20)} median=${median.toFixed(2)}ms  per-action=${perAction.toFixed(2)}µs`,
  );
}

console.log("queue drain benchmark");
console.log("=".repeat(60));
await bench("n=100", 100);
await bench("n=500", 500);
await bench("n=1000", 1000);
await bench("n=5000", 5000);
await bench("n=10000", 10000);
await bench("n=50000", 50000);
