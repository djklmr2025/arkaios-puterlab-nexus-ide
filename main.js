import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'PuterLab Nexus IDE',
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------- IPC Handlers ----------

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) return null;
  const folderPath = result.filePaths[0];
  return {
    path: folderPath,
    name: path.basename(folderPath)
  };
});

ipcMain.handle('fs:listTree', async (_, { rootPath, maxEntries = 4000 }) => {
  if (!rootPath || !existsSync(rootPath)) return [];
  const entries = [];

  async function walk(dirPath, relativePrefix, depth = 0) {
    if (entries.length > maxEntries || depth > 12) return;
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      for (const item of items) {
        if (item.name.startsWith('.git') || item.name === 'node_modules') continue;
        const relPath = relativePrefix ? `${relativePrefix}/${item.name}` : item.name;
        const fullPath = path.join(dirPath, item.name);
        if (item.isDirectory()) {
          entries.push({ path: relPath, kind: 'dir' });
          await walk(fullPath, relPath, depth + 1);
        } else if (item.isFile()) {
          entries.push({ path: relPath, kind: 'file' });
        }
        if (entries.length > maxEntries) break;
      }
    } catch (e) {
      console.error('Error walking dir:', e);
    }
  }

  await walk(rootPath, '');
  return entries;
});

ipcMain.handle('fs:readFile', async (_, filePath) => {
  try {
    if (!existsSync(filePath)) return null;
    return await fs.readFile(filePath, 'utf-8');
  } catch (e) {
    console.error('Error reading file:', e);
    return null;
  }
});

ipcMain.handle('fs:writeFile', async (_, { filePath, content }) => {
  try {
    const parent = path.dirname(filePath);
    if (!existsSync(parent)) {
      await fs.mkdir(parent, { recursive: true });
    }
    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (e) {
    console.error('Error writing file:', e);
    return false;
  }
});

ipcMain.handle('fs:deletePath', async (_, targetPath) => {
  try {
    if (!existsSync(targetPath)) return true;
    await fs.rm(targetPath, { recursive: true, force: true });
    return true;
  } catch (e) {
    console.error('Error deleting path:', e);
    return false;
  }
});

ipcMain.handle('fs:mkdir', async (_, dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return true;
  } catch (e) {
    console.error('Error creating dir:', e);
    return false;
  }
});

ipcMain.handle('os:execCommand', async (_, { command, cwd }) => {
  return new Promise((resolve) => {
    const options = {
      cwd: cwd && existsSync(cwd) ? cwd : process.cwd(),
      maxBuffer: 1024 * 1024 * 5
    };
    exec(command, options, (error, stdout, stderr) => {
      resolve({
        success: !error,
        stdout: stdout || '',
        stderr: stderr || (error ? error.message : ''),
        code: error ? (error.code || 1) : 0
      });
    });
  });
});
