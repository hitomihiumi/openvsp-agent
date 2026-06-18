import 'dotenv/config';
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import started from 'electron-squirrel-startup';
import { createChatServer } from './server/index.js';

if (started) {
  app.quit();
}

let mainWindow = null;
let serverPort = 0;

async function findVspGui() {
  // 1. Explicit env override
  const envPath = process.env.OPEN_VSP_GUI_PATH;
  if (envPath) {
    try {
      await access(envPath);
      return envPath;
    } catch {
      console.warn(`OPEN_VSP_GUI_PATH set but not accessible: ${envPath}`);
    }
  }

  // 2. Try the default executable name on PATH
  const candidates = process.platform === 'win32'
    ? ['vsp.exe', 'vsp']
    : ['vsp', 'vsp.exe'];

  for (const candidate of candidates) {
    try {
      // spawn 'where' on Windows or 'which' elsewhere to locate the binary
      const finder = process.platform === 'win32' ? 'where' : 'which';
      const result = await new Promise((resolve) => {
        const proc = spawn(finder, [candidate], { shell: true });
        let out = '';
        proc.stdout.on('data', (data) => { out += data.toString(); });
        proc.on('close', (code) => {
          const first = out.trim().split(/\r?\n/)[0];
          resolve(code === 0 && first ? first : null);
        });
        proc.on('error', () => resolve(null));
      });
      if (result) return result;
    } catch {
      // continue to next candidate
    }
  }

  return null;
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'OpenVSP AI Agent',
    backgroundColor: '#1a1a2e',
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }
};

// IPC Handlers
ipcMain.handle('get-server-port', () => serverPort);

ipcMain.handle('open-in-vsp', async (_event, vspFilePath) => {
  const vspGui = await findVspGui();
  if (!vspGui) {
    return {
      success: false,
      message: 'OpenVSP GUI executable not found. Set OPEN_VSP_GUI_PATH in .env or add vsp/vsp.exe to PATH.',
    };
  }

  try {
    const child = spawn(vspGui, [vspFilePath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { success: true, message: `Opened ${vspFilePath} in OpenVSP GUI.` };
  } catch (error) {
    return { success: false, message: `Failed to launch OpenVSP GUI: ${error.message}` };
  }
});

app.whenReady().then(() => {
  // Start Express server
  const server = createChatServer();
  const listener = server.listen(0, '127.0.0.1', () => {
    serverPort = listener.address().port;
    console.log(`Chat server running on port ${serverPort}`);

    createWindow();
  });

  listener.on('error', (err) => {
    console.error('Server error:', err);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
