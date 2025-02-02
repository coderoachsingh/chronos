import { app, BrowserWindow, screen, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import path from "node:path";
import fetch from "node-fetch";

let pythonProcess: ChildProcessWithoutNullStreams | null = null;
pythonProcess = spawn("python", ["python_backend/engine.py"]);

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
// function createPythonProcess() {
//   // Spawn Python process
//   pythonProcess = spawn("python", ["python_backend/engine.py"]);

//   // Handle data coming from Python
//   pythonProcess.stdout.on("data", (data) => {
//     let dataBuffer = "";
//     // Convert Buffer to string and add to buffer
//     dataBuffer += data.toString();
//     console.log(dataBuffer);

// Process complete messages
// let newlineIndex;
// while ((newlineIndex = dataBuffer.indexOf("\n")) !== -1) {
//   const message = dataBuffer.slice(0, newlineIndex);
//   dataBuffer = dataBuffer.slice(newlineIndex + 1);

//   try {
//     const parsedData = JSON.parse(message);
//     console.log("\nFIRST CHECK\n");
//     win?.webContents.send("python-message", parsedData);
//     console.log("\nSECOND CHECK\n");

//   } catch {
//     console.log("\nERROR CHECK\n");

//     console.error("Failed to parse Python output:", message);
//   }
// }
// });

// Handle Python errors
// pythonProcess.stderr.on("data", (data) => {
//   console.log(data);
//   console.error(`\n\n\nPython Error: ${data}`);
//   win?.webContents.send("python-error", data.toString());
// });

// // Handle Python process exit
// pythonProcess.on("close", (code) => {
//   console.log(`Python process exited with code ${code}`);
//   if (code !== 0) {
//     // Restart Python process if it crashes
//     // createPythonProcess();
//   }
// });
// }
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
    // createPythonProcess();
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
    // createPythonProcess();
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

////
////
//// Handle IPC messages from renderer ////
ipcMain.on("query-docs", (event, query) => {
  fetch("http://10.5.145.46:5000/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  })
    .then((response) => response.json())
    .then((data) => {
      console.log(data.answer);
      event.reply("query-docs-reply", data.answer)
    })
    .catch((error) => console.error(error));
});

//
ipcMain.on("load-document", async (_, filePath) => {
  fetch("http://localhost:5000/load_document", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file_path: filePath }),
  })
    .then((response) => response.json())
    .catch((error) => console.error(error));
});
