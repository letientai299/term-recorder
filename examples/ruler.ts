import { defineConfig, main, record } from "../src";

const config = defineConfig({
  cols: 60,
  rows: 20,
  typingDelay: 0,
  actionDelay: 0,
  pace: 0,
  trailingDelay: 2000,
});

/**
 * Build a cols × rows ruler frame as an array of strings.
 *
 * ╒═══╤═══╤═══╤═══╤═══╤═══╤═══╤═══╤═══╤═══╤═══╤═══╤═══╤═══╤══╕
 * │ 2                                                        │
 * │ ...                                                      │
 * │18                                                        │
 * │       10        20        30        40        50        60
 * ╘═20════╧═══╧═══╧═══╧═══╧═══╧═══╧═══╧═══╧═══╧═══╧═══╧═══╧══╛
 */
function rulerLines(c: number, r: number): string[] {
  function hBorder(
    lCorner: string,
    tick: string,
    bar: string,
    rCorner: string,
    embed?: string,
  ): string {
    // Build with absolute column indices so top and bottom ticks align.
    const chars = new Array(c).fill(bar);
    chars[0] = lCorner;
    chars[c - 1] = rCorner;
    for (let i = 10; i < c - 1; i += 10) chars[i] = tick;
    if (embed) {
      const seg = bar + embed + bar;
      for (let j = 0; j < seg.length && j + 1 < c - 1; j++) {
        chars[1 + j] = seg[j];
      }
    }
    return chars.join("");
  }

  function contentRow(row: number): string {
    const label = ` ${String(row)}`;
    return `│${label}${" ".repeat(c - 2 - label.length)}│`;
  }

  function tickRow(): string {
    const body = new Array(c).fill(" ");
    body[0] = "│";
    body[c - 1] = "│";
    // Reserve space for total cols label at the right edge
    const cl = String(c);
    const clStart = c - cl.length;
    // Place labels at every 10th col, skip if it overlaps the cols label
    for (let col = 10; col < c; col += 10) {
      const label = String(col);
      const start = col - label.length;
      if (col > clStart) continue;
      for (let j = 0; j < label.length; j++) {
        const pos = start + j;
        if (pos > 0 && pos < c - 1) body[pos] = label[j];
      }
    }
    for (let j = 0; j < cl.length; j++) body[clStart + j] = cl[j];
    return body.join("");
  }

  const lines: string[] = [];
  lines.push(hBorder("╒", "╤", "═", "╕"));
  const hasTick = r >= 5;
  if (hasTick) {
    for (let row = 2; row <= r - 2; row++) lines.push(contentRow(row));
    lines.push(tickRow());
  } else {
    for (let row = 2; row < r; row++) lines.push(contentRow(row));
  }
  lines.push(hBorder("╘", "╧", "═", "╛", String(r)));
  return lines;
}

function rulerCmd(c: number, r: number): string {
  const lines = rulerLines(c, r);
  const allButLast = lines
    .slice(0, -1)
    .map((l) => `'${l}'`)
    .join(" ");
  const last = lines[lines.length - 1];
  return `printf '%s\\n' ${allButLast} && printf '%s' '${last}'`;
}

const ruler = record("ruler", (s, cfg) => {
  const cmd = rulerCmd(cfg.cols, cfg.rows);
  s.detectPrompt();
  s.send(`cat > /tmp/ruler.sh << 'RULER'\n${cmd}\nRULER\n`);
  s.waitForPrompt();
  s.send("clear && sh /tmp/ruler.sh && exec cat\n");
  s.waitForText(String(cfg.rows));
});

await main(config, [ruler]);
