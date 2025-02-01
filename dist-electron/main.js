import { app, BrowserWindow, ipcMain, screen } from "electron";
import { fileURLToPath } from "node:url";
import { spawn } from "child_process";
import path from "node:path";
import * as fs from "fs";
let pythonProcess = null;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
const userDataPath = app.getPath("userData");
const sizeFile = path.join(userDataPath, "window-size.json");
const getDefaultSize = () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  return { width, height };
};
const getSavedSize = () => {
  if (fs.existsSync(sizeFile)) {
    const sizeData = fs.readFileSync(sizeFile);
    return JSON.parse(sizeData.toString());
  }
  return null;
};
const saveSize = (width, height) => {
  fs.writeFileSync(sizeFile, JSON.stringify({ width, height }));
};
function createPythonProcess() {
  pythonProcess = spawn("python", ["./python_backend/engine.py"], {
    stdio: ["pipe", "pipe", "pipe"]
  });
  pythonProcess.stdout.on("data", (data) => {
    let dataBuffer = "";
    dataBuffer += data.toString();
    let newlineIndex;
    while ((newlineIndex = dataBuffer.indexOf("\n")) !== -1) {
      const message = dataBuffer.slice(0, newlineIndex);
      dataBuffer = dataBuffer.slice(newlineIndex + 1);
      try {
        const parsedData = JSON.parse(message);
        win == null ? void 0 : win.webContents.send("python-message", parsedData);
      } catch (e) {
        console.error("Failed to parse Python output:", message);
      }
    }
  });
  pythonProcess.stderr.on("data", (data) => {
    console.error(`Python Error: ${data}`);
    win == null ? void 0 : win.webContents.send("python-error", data.toString());
  });
  pythonProcess.on("close", (code) => {
    console.log(`Python process exited with code ${code}`);
    if (code !== 0) {
      createPythonProcess();
    }
  });
}
const createWindow = () => {
  const savedSize = getSavedSize();
  const defaultSize = getDefaultSize();
  const { width, height } = savedSize || defaultSize;
  win = new BrowserWindow({
    width,
    height,
    autoHideMenuBar: true,
    icon: "public/icon/Round App Logo.png",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    createPythonProcess();
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
    createPythonProcess();
  }
  win.on("resize", () => {
    if (win) {
      saveSize(win.getBounds().width, win.getBounds().height);
    }
  });
};
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.on("before-quit", () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});
app.whenReady().then(createWindow);
ipcMain.handle("query-docs", async (_, query) => {
  console.log("Querying docs:", query);
  return new Promise((resolve, reject) => {
    try {
      const message = JSON.stringify(query) + "\n";
      pythonProcess == null ? void 0 : pythonProcess.stdin.write(message);
      resolve({ status: "sent" });
    } catch (error) {
      reject(error);
    }
  });
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
