process.env.PATH = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  process.env.PATH,
].join(":");

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
function findYtDlp() {
  const local = path.join(
    __dirname,
    process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
  );
  if (fs.existsSync(local)) return local;
  const candidates =
    process.platform === "win32"
      ? [
          path.join("C:\\", "Program Files", "yt-dlp", "yt-dlp.exe"),
          path.join("C:\\", "yt-dlp.exe"),
        ]
      : [
          "/usr/local/bin/yt-dlp",
          "/opt/homebrew/bin/yt-dlp",
          "/usr/bin/yt-dlp",
        ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
}
const ytdlpPath = findYtDlp();

function findFfmpeg() {
  const local = path.join(
    __dirname,
    process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
  );
  if (fs.existsSync(local)) return local;

  const candidates =
    process.platform === "win32"
      ? [
          path.join("C:\\", "ffmpeg", "bin", "ffmpeg.exe"),
          path.join("C:\\", "Program Files", "ffmpeg", "bin", "ffmpeg.exe"),
          "ffmpeg.exe",
        ]
      : [
          "/opt/homebrew/bin/ffmpeg",
          "/usr/local/bin/ffmpeg",
          "/usr/bin/ffmpeg",
          "ffmpeg",
        ];

  for (const p of candidates) if (fs.existsSync(p)) return p;

  return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
}
const ffmpegPath = findFfmpeg();

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  win.loadFile("index.html");
}

app.whenReady().then(createWindow);
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function isValidYouTubeUrl(url) {
  return /^(https?:\/\/)?(www\.)?youtube\.com\/(watch\?v=|shorts\/)[\w-]+/.test(
    url
  );
}

ipcMain.on("download-video", async (event, data) => {
  const url = typeof data === "string" ? data : data.url;
  const quality =
    data.quality ||
    "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best";

  if (!ytdlpPath) {
    event.sender.send("download-finished", "yt-dlp not found!");
    return;
  }

  if (!isValidYouTubeUrl(url)) {
    event.sender.send("download-finished", "Invalid YouTube URL");
    return;
  }

  let videoTitle = "video";
  try {
    const ytDlpTitle = spawn(ytdlpPath, ["--get-title", url]);
    let titleOutput = "";

    for await (const chunk of ytDlpTitle.stdout) {
      titleOutput += chunk.toString();
    }

    videoTitle = titleOutput
      .trim()
      .replace(/[<>:"/\\|?*]+/g, "")
      .substring(0, 50);

    await new Promise((resolve) => ytDlpTitle.on("close", resolve));
  } catch {
    videoTitle = "video";
  }

  const savePath = dialog.showSaveDialogSync({
    title: "Save Video",
    defaultPath: `${videoTitle}.mp4`,
    filters: [{ name: "Videos", extensions: ["mp4"] }],
  });
  if (!savePath) {
    event.sender.send("download-finished", "Download cancelled.");
    return;
  }

  const tempPath = savePath.replace(/\.mp4$/, "_orig.mp4");

  let ytDlp;
  try {
    ytDlp = spawn(ytdlpPath, [
      "-f",
      quality,
      "--merge-output-format",
      "mp4",
      "-o",
      tempPath,
      url,
    ]);
  } catch {
    event.sender.send("download-finished", "yt-dlp başlatılamadı!");
    return;
  }

  ytDlp.stderr.on("data", (data) => {
    const str = data.toString();
    const match = str.match(/\[download\].*?(\d{1,3}(?:\.\d+)?)%/);
    if (match && match[1]) {
      const percent = parseFloat(match[1]);
      event.sender.send("download-progress", percent);
    }
    if (str.includes("Merging formats into")) {
      event.sender.send("download-progress", 100);
      event.sender.send("download-merging");
    }
  });

  ytDlp.on("close", async (code) => {
    if (code === 0) {
      try {
        const ffmpeg = spawn(ffmpegPath, [
          "-i",
          tempPath,
          "-c:v",
          "libx264",
          "-c:a",
          "aac",
          "-movflags",
          "+faststart",
          "-y",
          savePath,
        ]);
        ffmpeg.stderr.on("data", () => {});
        ffmpeg.on("close", (ffcode) => {
          if (fs.existsSync(tempPath)) {
            try {
              fs.unlinkSync(tempPath);
            } catch (e) {
              console.warn("Temp file delete error:", e);
            }
          }
          if (ffcode === 0) {
            event.sender.send("download-finished", "Download completed! 🍰✨");
            shell.showItemInFolder(savePath);
          } else {
            event.sender.send("download-finished", "ffmpeg error!");
          }
        });
      } catch {
        event.sender.send("download-finished", "ffmpeg conversion failed!");
      }
    } else {
      event.sender.send("download-finished", "Download failed (yt-dlp error).");
    }
  });

  ytDlp.on("error", () => {
    event.sender.send("download-finished", "yt-dlp binary cannot be launched!");
  });
})