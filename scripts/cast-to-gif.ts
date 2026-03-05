import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, parse } from "node:path";

const FONT_DIR = ".fonts/FiraCode";
const FONT_URL =
  "https://github.com/ryanoasis/nerd-fonts/releases/latest/download/FiraCode.tar.xz";
const CAST_DIR = "casts";

if (!existsSync(FONT_DIR)) {
  console.log("Downloading FiraCode Nerd Font...");
  mkdirSync(FONT_DIR, { recursive: true });
  execFileSync(
    "sh",
    ["-c", `curl -fsSL "${FONT_URL}" | tar -xJ -C "${FONT_DIR}"`],
    {
      stdio: "inherit",
    },
  );
}

const castFiles = readdirSync(CAST_DIR).filter((f) => f.endsWith(".cast"));

for (const file of castFiles) {
  const input = join(CAST_DIR, file);
  const output = join(CAST_DIR, `${parse(file).name}.gif`);
  console.log(`Converting ${file}...`);
  execFileSync(
    "agg",
    [
      "--font-dir",
      FONT_DIR,
      "--font-family",
      "FiraCode Nerd Font",
      input,
      output,
    ],
    { stdio: "inherit" },
  );
}
