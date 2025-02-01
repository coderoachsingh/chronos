import { app, BrowserWindow, screen, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import path from "node:path";

let pythonProcess: ChildProcessWithoutNullStreams | null = null;
import * as fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, "..");

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null;

const userDataPath = app.getPath("userData");
const sizeFile = path.join(userDataPath, "window-size.json");

//
// Returns the default window size
const getDefaultSize = (): { width: number; height: number } => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  return { width, height }; // max-window
};

// Retrieves the saved window size
const getSavedSize = (): { width: number; height: number } | null => {
  if (fs.existsSync(sizeFile)) {
    const sizeData = fs.readFileSync(sizeFile);
    return JSON.parse(sizeData.toString());
  }
  return null;
};

// Saves the current window size to a file
const saveSize = (width: number, height: number): void => {
  fs.writeFileSync(sizeFile, JSON.stringify({ width, height }));
};

//
function createPythonProcess() {
  // Spawn Python process
  pythonProcess = spawn("python", ["./python_backend/engine.py"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Handle data coming from Python
  pythonProcess.stdout.on("data", (data) => {
    let dataBuffer = "";
    // Convert Buffer to string and add to buffer
    dataBuffer += data.toString();

    // Process complete messages
    let newlineIndex;
    while ((newlineIndex = dataBuffer.indexOf("\n")) !== -1) {
      const message = dataBuffer.slice(0, newlineIndex);
      dataBuffer = dataBuffer.slice(newlineIndex + 1);

      try {
        const parsedData = JSON.parse(message);
        win?.webContents.send("python-message", parsedData);
      } catch (e) {
        console.error("Failed to parse Python output:", message);
      }
    }
  });

  // Handle Python errors
  pythonProcess.stderr.on("data", (data) => {
    console.error(`Python Error: ${data}`);
    win?.webContents.send("python-error", data.toString());
  });

  // Handle Python process exit
  pythonProcess.on("close", (code) => {
    console.log(`Python process exited with code ${code}`);
    if (code !== 0) {
      // Restart Python process if it crashes
      createPythonProcess();
    }
  });
}
//
const createWindow = () => {
  const savedSize = getSavedSize();
  const defaultSize = getDefaultSize();

  const { width, height } = savedSize || defaultSize;

  // Create the browser window.
  win = new BrowserWindow({
    width: width,
    height: height,
    autoHideMenuBar: true,
    icon: "public/icon/Round App Logo.png",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Test active push message to Renderer-process.
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    createPythonProcess();
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
    createPythonProcess();
  }

  // Save the window size when it is resized.
  win.on("resize", () => {
    if (win) {
      saveSize(win.getBounds().width, win.getBounds().height);
    }
  });
};

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Clean up Python process on exit
app.on("before-quit", () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});

app.whenReady().then(createWindow);

///
////
// Handle IPC messages from renderer
ipcMain.handle("query-docs", async (_, query) => {
  console.log("Querying docs:", query);
  return new Promise((resolve, reject) => {
    try {
      // Send query to Python process
      const message = JSON.stringify(query) + "\n";
      pythonProcess?.stdin.write(message);
      resolve({ status: "sent" });
    } catch (error) {
      reject(error);
    }
  });
});
