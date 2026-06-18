import 'dotenv/config';
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { createChatServer } from './server/index.js';

if (started) {
  app.quit();
}

let mainWindow = null;
let serverPort = 0;

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
