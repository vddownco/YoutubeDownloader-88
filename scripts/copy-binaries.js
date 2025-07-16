const fs = require("fs");
const path = require("path");

const distPath = path.join(__dirname, "..", "dist");
const binaries = ["yt-dlp.exe", "ffmpeg.exe"];

binaries.forEach((binary) => {
  const sourcePath = path.join(__dirname, "..", binary);
  const destPath = path.join(distPath, binary);

  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`✔️ ${binary} copied to dist/`);
  } else {
    console.warn(`⚠️  ${binary} not found in project root.`);
  }
});
