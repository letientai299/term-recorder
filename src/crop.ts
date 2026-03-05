import { readFileSync, writeFileSync } from "node:fs";

// --- Token types ---

interface CsiToken {
  type: "csi";
  raw: string;
  params: string; // e.g. "1;2" or "?25"
  final: string; // e.g. "H", "m", "J"
}

interface OscToken {
  type: "osc";
  raw: string;
}

interface DcsToken {
  type: "dcs";
  raw: string;
}

interface EscToken {
  type: "esc";
  raw: string;
}

interface CtrlToken {
  type: "ctrl";
  raw: string;
  code: number;
}

interface TextToken {
  type: "text";
  raw: string;
}

type Token = CsiToken | OscToken | DcsToken | EscToken | CtrlToken | TextToken;

// --- Tokenizer ---

enum State {
  Ground,
  Escape,
  CsiParam,
  OscBody,
  DcsBody,
}

/** Split raw terminal data into typed tokens. */
export function tokenize(data: string): Token[] {
  const tokens: Token[] = [];
  let state = State.Ground;
  let buf = "";
  let textBuf = "";

  const flushText = () => {
    if (textBuf) {
      tokens.push({ type: "text", raw: textBuf });
      textBuf = "";
    }
  };

  for (let i = 0; i < data.length; i++) {
    const ch = data.charAt(i);
    const code = ch.charCodeAt(0);

    switch (state) {
      case State.Ground:
        if (code === 0x1b) {
          flushText();
          buf = ch;
          state = State.Escape;
        } else if (code < 0x20 || code === 0x7f) {
          flushText();
          tokens.push({ type: "ctrl", raw: ch, code });
        } else {
          textBuf += ch;
        }
        break;

      case State.Escape:
        buf += ch;
        if (ch === "[") {
          state = State.CsiParam;
        } else if (ch === "]") {
          state = State.OscBody;
        } else if (ch === "P") {
          state = State.DcsBody;
        } else {
          // Two-char escape like \e(B, \e=, etc.
          // Some need a third char (e.g. \e(B for charset)
          if (ch === "(" || ch === ")" || ch === "*" || ch === "+") {
            // Charset designation — consume the next char too
            if (i + 1 < data.length) {
              buf += data[++i];
            }
          }
          flushText();
          tokens.push({ type: "esc", raw: buf });
          buf = "";
          state = State.Ground;
        }
        break;

      case State.CsiParam:
        buf += ch;
        // CSI params: digits, semicolons, and prefix chars (?  > =)
        if (
          (code >= 0x30 && code <= 0x3b) ||
          ch === "?" ||
          ch === ">" ||
          ch === "="
        ) {
          // Still collecting params
        } else if (code >= 0x20 && code <= 0x2f) {
          // Intermediate bytes (e.g. space in "CSI 2 q")
        } else if (code >= 0x40 && code <= 0x7e) {
          // Final byte
          const paramStart = 2; // skip \e[
          const raw = buf;
          // Extract params: everything between \e[ and final byte, minus intermediates
          let paramEnd = raw.length - 1;
          while (
            paramEnd > paramStart &&
            raw.charCodeAt(paramEnd - 1) >= 0x20 &&
            raw.charCodeAt(paramEnd - 1) <= 0x2f
          ) {
            paramEnd--;
          }
          tokens.push({
            type: "csi",
            raw,
            params: raw.slice(paramStart, paramEnd),
            final: ch,
          });
          buf = "";
          state = State.Ground;
        } else {
          // Malformed — emit as esc
          tokens.push({ type: "esc", raw: buf });
          buf = "";
          state = State.Ground;
        }
        break;

      case State.OscBody:
        buf += ch;
        // OSC terminated by BEL (\x07) or ST (\e\\)
        if (code === 0x07) {
          tokens.push({ type: "osc", raw: buf });
          buf = "";
          state = State.Ground;
        } else if (
          ch === "\\" &&
          buf.length >= 2 &&
          buf[buf.length - 2] === "\x1b"
        ) {
          tokens.push({ type: "osc", raw: buf });
          buf = "";
          state = State.Ground;
        }
        break;

      case State.DcsBody:
        buf += ch;
        // DCS terminated by ST (\e\\)
        if (ch === "\\" && buf.length >= 2 && buf[buf.length - 2] === "\x1b") {
          tokens.push({ type: "dcs", raw: buf });
          buf = "";
          state = State.Ground;
        } else if (code === 0x07) {
          // Some implementations use BEL as DCS terminator
          tokens.push({ type: "dcs", raw: buf });
          buf = "";
          state = State.Ground;
        }
        break;
    }
  }

  // Flush remaining
  flushText();
  if (buf) {
    tokens.push({ type: "esc", raw: buf });
  }

  return tokens;
}

// --- CSI param parsing helpers ---

function parseIntParam(s: string, fallback: number): number {
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) || n === 0 ? fallback : n;
}

function parseCsiParams(params: string): number[] {
  if (!params) return [];
  return params.split(";").map((s) => parseIntParam(s, 0));
}

// --- cropFrameData ---

/**
 * Filter out frame data that targets the border area (beyond cols/rows).
 * Tracks cursor position and only emits content within bounds.
 */
export function cropFrameData(
  data: string,
  cols: number,
  rows: number,
): string {
  const tokens = tokenize(data);
  let curCol = 1;
  let curRow = 1;
  let _emittedCol = 1;
  let _emittedRow = 1;
  let dirty = false; // cursor moved since last emit
  let out = "";

  const emitCursorIfDirty = () => {
    if (dirty) {
      out += `\x1b[${curRow};${curCol}H`;
      _emittedCol = curCol;
      _emittedRow = curRow;
      dirty = false;
    }
  };

  const inBounds = () =>
    curCol >= 1 && curCol <= cols && curRow >= 1 && curRow <= rows;

  for (const token of tokens) {
    switch (token.type) {
      case "text": {
        for (const ch of token.raw) {
          if (inBounds()) {
            emitCursorIfDirty();
            out += ch;
            _emittedCol = curCol + 1;
            _emittedRow = curRow;
          }
          curCol++;
          // Auto-wrap at cols+1 (we track logical position)
          if (curCol > cols + 1) {
            curCol = 1;
            curRow++;
            dirty = true;
          }
        }
        break;
      }

      case "csi": {
        const { params, final: fin, raw } = token;

        // SGR — always pass through
        if (fin === "m") {
          out += raw;
          break;
        }

        // Cursor movement
        switch (fin) {
          case "H":
          case "f": {
            // CUP / HVP: \e[row;colH
            const parts = parseCsiParams(params);
            curRow = Math.max(1, parts[0] || 1);
            curCol = Math.max(1, parts[1] || 1);
            dirty = true;
            break;
          }
          case "A": {
            // CUU — cursor up
            const n = parseIntParam(params, 1);
            curRow = Math.max(1, curRow - n);
            dirty = true;
            break;
          }
          case "B": {
            // CUD — cursor down
            const n = parseIntParam(params, 1);
            curRow += n;
            dirty = true;
            break;
          }
          case "C": {
            // CUF — cursor forward
            const n = parseIntParam(params, 1);
            curCol += n;
            dirty = true;
            break;
          }
          case "D": {
            // CUB — cursor back
            const n = parseIntParam(params, 1);
            curCol = Math.max(1, curCol - n);
            dirty = true;
            break;
          }
          case "G": {
            // CHA — cursor horizontal absolute
            curCol = Math.max(1, parseIntParam(params, 1));
            dirty = true;
            break;
          }
          case "d": {
            // VPA — vertical position absolute
            curRow = Math.max(1, parseIntParam(params, 1));
            dirty = true;
            break;
          }
          case "E": {
            // CNL — cursor next line
            const n = parseIntParam(params, 1);
            curRow += n;
            curCol = 1;
            dirty = true;
            break;
          }
          case "F": {
            // CPL — cursor previous line
            const n = parseIntParam(params, 1);
            curRow = Math.max(1, curRow - n);
            curCol = 1;
            dirty = true;
            break;
          }
          case "r": {
            // DECSTBM — set scrolling region \e[top;bottomr
            const parts = parseCsiParams(params);
            const top = parts[0] || 1;
            let bottom = parts[1] || rows;
            if (bottom > rows) bottom = rows;
            out += `\x1b[${top};${bottom}r`;
            break;
          }
          default: {
            // ED, EL, and other CSI — emit only if in bounds
            if (inBounds()) {
              emitCursorIfDirty();
              out += raw;
            }
            break;
          }
        }
        break;
      }

      case "ctrl": {
        if (token.code === 0x0d) {
          // CR
          curCol = 1;
          dirty = true;
        } else if (token.code === 0x0a) {
          // LF
          curRow++;
          dirty = true;
        } else if (token.code === 0x08) {
          // BS
          curCol = Math.max(1, curCol - 1);
          dirty = true;
        } else if (token.code === 0x09) {
          // Tab — advance to next tab stop (every 8 cols)
          const nextTab = (Math.floor((curCol - 1) / 8) + 1) * 8 + 1;
          curCol = nextTab;
          dirty = true;
        } else if (token.code === 0x07) {
          // BEL — always pass through
          out += token.raw;
        }
        break;
      }

      case "osc":
      case "dcs":
      case "esc": {
        // Always pass through
        out += token.raw;
        break;
      }
    }
  }

  return out;
}

// --- cropCast ---

type CastEvent = [number, string, string];

/**
 * Read a cast file, crop each output event to the given dimensions, write back.
 * Best-effort: errors are silently ignored.
 */
export function cropCast(path: string, cols: number, rows: number): void {
  try {
    const content = readFileSync(path, "utf-8");
    const lines = content.split("\n");
    if (lines.length < 2) return;

    const header = lines[0];
    const processed: string[] = [header ?? ""];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as CastEvent;
        if (event[1] === "o") {
          event[2] = cropFrameData(event[2], cols, rows);
        }
        processed.push(JSON.stringify(event));
      } catch {
        // Malformed line — keep as-is
        processed.push(line);
      }
    }

    writeFileSync(path, `${processed.join("\n")}\n`);
  } catch {
    // Best-effort
  }
}
