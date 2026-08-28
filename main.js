import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import http from 'node:http';
import { existsSync, createReadStream, statSync } from 'node:fs';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let localServer;
const PORT = 18123; // Puerto interno del ejecutable

// ─── MIME types para el servidor HTTP embebido ────────────────────────────────
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
};

/**
 * Arranca un servidor HTTP local embebido en el proceso Electron.
 * Esto permite que Puter.js (que RECHAZA file://) funcione correctamente
 * porque la app se sirve desde http://localhost:PORT/
 */
function startEmbeddedServer() {
  return new Promise((resolve) => {
    localServer = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      let reqPath = decodeURIComponent(req.url.split('?')[0]);
      if (reqPath === '/') reqPath = '/index.html';

      const filePath = path.join(__dirname, reqPath);

      // Seguridad: No salir del directorio de la app
      if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      createReadStream(filePath).pipe(res);
    });

    localServer.listen(PORT, '127.0.0.1', () => {
      console.log(`[PuterLab] Servidor HTTP embebido activo en http://127.0.0.1:${PORT}/`);
      resolve();
    });

    localServer.on('error', (err) => {
      // Si el puerto ya está en uso, intentar el siguiente disponible (fallback)
      console.error(`[PuterLab] Error en servidor HTTP embebido: ${err.message}`);
      resolve(); // continuar aunque falle, para no bloquear el inicio
    });
  });
}

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

  // ✅ Cargar desde http://localhost en lugar de file:///
  // Esto soluciona el error "Puter.js Error: Unsupported Protocol"
  mainWindow.loadURL(`http://127.0.0.1:${PORT}/index.html`);
}

app.whenReady().then(async () => {
  await startEmbeddedServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (localServer) localServer.close();
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


