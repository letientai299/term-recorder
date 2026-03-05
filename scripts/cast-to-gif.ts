import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, parse } from "node:path";

const NERD_FONTS_BASE =
  "https://github.com/ryanoasis/nerd-fonts/releases/latest/download";

// Font archives to download — FiraCode for text, Symbols for nerd font icons
const FONT_ARCHIVES: Record<string, string> = {
  FiraCode: `${NERD_FONTS_BASE}/FiraCode.tar.xz`,
  NerdFontsSymbolsOnly: `${NERD_FONTS_BASE}/NerdFontsSymbolsOnly.tar.xz`,
};

const FONT_DIR = ".fonts";
const AGG_FONT_DIR = ".fonts/_merged";
const CAST_DIR = "casts";

// agg only supports one --font-dir, so merge all font dirs into a single
// directory via symlinks. Mirrors the approach in the cast2gif shell script.
const FONT_FAMILIES = [
  "FiraCode Nerd Font Mono",
  "Symbols Nerd Font Mono",
].join(",");

for (const [name, url] of Object.entries(FONT_ARCHIVES)) {
  const dir = join(FONT_DIR, name);
  if (!existsSync(dir)) {
    console.log(`Downloading ${name}...`);
    mkdirSync(dir, { recursive: true });
    execFileSync("sh", ["-c", `curl -fsSL "${url}" | tar -xJ -C "${dir}"`], {
      stdio: "inherit",
    });
  }
}

// Also pick up user-installed symbol fonts (Noto Sans Symbols 2, Noto Emoji)
// from the standard XDG font directory if available.
const xdgFontBase = process.env.XDG_DATA_HOME
  ? join(process.env.XDG_DATA_HOME, "fonts")
  : join(homedir(), ".local", "share", "fonts");

const extraFontDirs = ["NotoSansSymbols2", "NotoEmoji"]
  .map((d) => join(xdgFontBase, d))
  .filter((d) => existsSync(d));

// Merge all font files into a single directory via symlinks
mkdirSync(AGG_FONT_DIR, { recursive: true });
const allFontDirs = [
  ...Object.keys(FONT_ARCHIVES).map((n) => join(FONT_DIR, n)),
  ...extraFontDirs,
];

for (const dir of allFontDirs) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ttf"))) {
    const src = join(process.cwd(), dir, file);
    const dest = join(AGG_FONT_DIR, file);
    try {
      if (existsSync(dest) && readlinkSync(dest) === src) continue;
    } catch {
      // dest exists but isn't a symlink — remove and re-create
    }
    try {
      symlinkSync(src, dest);
    } catch {
      // already exists with correct target
    }
  }
}

const fontFamilies =
  extraFontDirs.length > 0
    ? `${FONT_FAMILIES},Noto Sans Symbols 2,Noto Emoji`
    : FONT_FAMILIES;

const args = process.argv.slice(2);
const castFiles =
  args.length > 0
    ? args.map((a) => (a.endsWith(".cast") ? a : `${a}.cast`))
    : readdirSync(CAST_DIR).filter((f) => f.endsWith(".cast"));

for (const file of castFiles) {
  const input = file.includes("/") ? file : join(CAST_DIR, file);
  const output = `${parse(input).dir}/${parse(input).name}.gif`;
  console.log(`Converting ${file}...`);
  execFileSync(
    "agg",
    [
      "--renderer",
      "fontdue",
      "--font-dir",
      AGG_FONT_DIR,
      "--font-family",
      fontFamilies,
      input,
      output,
    ],
    { stdio: "inherit" },
  );
}
