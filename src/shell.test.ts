import { describe, expect, test } from "bun:test";
import { quoteCcArg } from "./shell.ts";

describe("quoteCcArg", () => {
  test("returns empty single quotes for empty string", () => {
    expect(quoteCcArg("")).toBe("''");
  });

  test("passes through simple alphanumeric args", () => {
    expect(quoteCcArg("hello")).toBe("hello");
    expect(quoteCcArg("send-keys")).toBe("send-keys");
    expect(quoteCcArg("0.0")).toBe("0.0");
  });

  test("quotes args with spaces", () => {
    expect(quoteCcArg("hello world")).toBe("'hello world'");
  });

  test.each(["'", '"', "\\", "#", "$", ";", "~", "{", "}"])(
    "quotes args containing %s",
    (char) => {
      expect(quoteCcArg(`a${char}b`)).toStartWith("'");
    },
  );

  test("escapes internal single quotes", () => {
    expect(quoteCcArg("it's")).toBe("'it'\\''s'");
  });

  test("quotes args starting with dash", () => {
    expect(quoteCcArg("-l")).toBe("'-l'");
    expect(quoteCcArg("--flag")).toBe("'--flag'");
  });

  test("quotes tmux format sequences", () => {
    expect(quoteCcArg("#{pane_id}")).toBe("'#{pane_id}'");
  });
});
