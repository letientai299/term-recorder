import { defineConfig, main, record } from "../src";

const config = defineConfig({
  typingDelay: 10,
  actionDelay: 50,
  pace: 200,
});

const renderTest = record("render-test", (s) => {
  // ANSI basic colors
  s.run(
    "echo $'\\e[1;37m=== ANSI Colors ===\\e[0m\\n" +
      "\\e[30m█ Black   \\e[31m█ Red     \\e[32m█ Green   \\e[33m█ Yellow  " +
      "\\e[34m█ Blue    \\e[35m█ Magenta \\e[36m█ Cyan    \\e[37m█ White\\e[0m\\n" +
      "\\e[90m█ BrBlk   \\e[91m█ BrRed   \\e[92m█ BrGrn   \\e[93m█ BrYlw   " +
      "\\e[94m█ BrBlu   \\e[95m█ BrMag   \\e[96m█ BrCyn   \\e[97m█ BrWht\\e[0m\\n" +
      "\\e[41m fg on red \\e[42m fg on green \\e[44m fg on blue \\e[0m'",
  );

  // Text styles
  s.run(
    "echo $'\\e[1;37m=== Text Styles ===\\e[0m\\n" +
      "\\e[1mBold\\e[0m  \\e[2mDim\\e[0m  \\e[3mItalic\\e[0m  " +
      "\\e[4mUnderline\\e[0m  \\e[9mStrikethrough\\e[0m\\n" +
      "\\e[1;3mBold+Italic\\e[0m  \\e[1;4mBold+Underline\\e[0m  " +
      "\\e[3;4mItalic+Underline\\e[0m'",
  );

  // Nerd Font symbols
  s.run(
    "echo $'=== Nerd Font Symbols ===\\n" +
      "Powerline: \\ue0b0 \\ue0b1 \\ue0b2 \\ue0b3 \\ue0b4 \\ue0b6\\n" +
      "Devicons:  \\uf09b \\uf113 \\ue606 \\uf0e7 \\uf15c \\uf121\\n" +
      "Weather:   \\ue30d \\ue302 \\ue308 \\ue30a \\ue300 \\ue301'",
  );

  // Emoji
  s.run("echo $'\\e[1;37m=== Emoji ===\\e[0m\\n🎉 🚀 ✅ ❌ 🔥 💡 ⚡ 🎯 📦 🛠️'");

  // Unicode box drawing
  s.run(`cat << 'EOF'
=== Box Drawing ===
┌──────┬──────┐  ┏━━━━━━┳━━━━━━┓
│ light│ box  │  ┃ heavy┃ box  ┃
├──────┼──────┤  ┣━━━━━━╋━━━━━━┫
│ draw │ chars│  ┃ draw ┃ chars┃
└──────┴──────┘  ┗━━━━━━┻━━━━━━┛
EOF`);

  // 256 color palette
  s.run(
    "echo $'\\e[1;37m=== 256 Color Palette ===\\e[0m';" +
      " for i in $(seq 0 15); do printf '\\e[48;5;%dm  \\e[0m' $i; done; echo;" +
      " for i in $(seq 16 51); do printf '\\e[48;5;%dm  \\e[0m' $i; done; echo;" +
      " for i in $(seq 52 87); do printf '\\e[48;5;%dm  \\e[0m' $i; done; echo;" +
      " for i in $(seq 88 123); do printf '\\e[48;5;%dm  \\e[0m' $i; done; echo;" +
      " for i in $(seq 124 159); do printf '\\e[48;5;%dm  \\e[0m' $i; done; echo;" +
      " for i in $(seq 160 195); do printf '\\e[48;5;%dm  \\e[0m' $i; done; echo;" +
      " for i in $(seq 196 231); do printf '\\e[48;5;%dm  \\e[0m' $i; done; echo;" +
      " for i in $(seq 232 255); do printf '\\e[48;5;%dm  \\e[0m' $i; done; echo",
  );

  // True color gradient
  s.run(
    "echo $'\\e[1;37m=== True Color (24-bit) ===\\e[0m';" +
      " for i in $(seq 0 6 255); do" +
      " printf '\\e[48;2;%d;0;%dm \\e[0m' $i $((255-i)); done; echo;" +
      " for i in $(seq 0 6 255); do" +
      " printf '\\e[48;2;0;%d;%dm \\e[0m' $i $((255-i)); done; echo",
  );

  // Block elements and shading
  s.run(
    "echo $'\\e[1;37m=== Block Elements ===\\e[0m\\n" +
      "Shading:  ░░▒▒▓▓██  Light ░ Medium ▒ Dark ▓ Full █\\n" +
      "Halves:   ▀▄▌▐  Upper ▀ Lower ▄ Left ▌ Right ▐\\n" +
      "Quadrant: ▖▗▘▙▚▛▜▝'",
  );

  // Braille patterns (used by plotting libraries like plotext, termgraph)
  s.run(
    "echo $'\\e[1;37m=== Braille Patterns ===\\e[0m\\n" +
      "⠀⠁⠂⠃⠄⠅⠆⠇⡀⡁⡂⡃⡄⡅⡆⡇  ⣿⣷⣶⣦⣤⣄⣀⡀\\n" +
      "Sparkline: ⣀⣤⣴⣶⣾⣿⣷⣶⣴⣤⣀⣠⣤⣶⣿⣿⣶⣤⣀'",
  );

  // CJK double-width characters
  s.run(
    "echo $'\\e[1;37m=== Double-Width (CJK) ===\\e[0m\\n" +
      "日本語テスト  中文测试  한국어시험\\n" +
      "Mixed: Hello世界 こんにちはWorld 你好World'",
  );

  // Reverse video, hidden, blink
  s.run(
    "echo $'\\e[1;37m=== More Styles ===\\e[0m\\n" +
      "\\e[7mReverse\\e[0m  \\e[53mOverline\\e[0m  " +
      "\\e[4:3mUndercurl\\e[0m  \\e[4:4mDotted UL\\e[0m  \\e[4:5mDashed UL\\e[0m\\n" +
      "\\e[58;5;196m\\e[4mColored Underline\\e[0m  " +
      "\\e[58;2;0;200;100m\\e[4:3mGreen Undercurl\\e[0m'",
  );

  // Hyperlinks (OSC 8)
  s.run(
    "echo $'\\e[1;37m=== Hyperlinks (OSC 8) ===\\e[0m\\n" +
      "\\e]8;;https://github.com\\e\\\\GitHub\\e]8;;\\e\\\\  " +
      "\\e]8;;https://en.wikipedia.org\\e\\\\Wikipedia\\e]8;;\\e\\\\\\'",
  );

  s.sleep(1000);
});

await main(config, [renderTest]);
