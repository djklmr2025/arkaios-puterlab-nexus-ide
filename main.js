import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import http from 'node:http';
import { existsSync, statSync } from 'node:fs';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let localServer;
const PORT = 18123;

// ─── MIME types ───────────────────────────────────────────────────────────────
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.webp': 'image/webp',
};

/**
 * Raíz real de los archivos de la app.
 * - Desarrollo: __dirname (carpeta del script)
 * - Empaquetado con asar: app.getAppPath() → ruta dentro del .asar
 *   (Electron parchea fs para leer .asar como si fuera un directorio real)
 */
function getAppRoot() {
  return app.isPackaged ? app.getAppPath() : __dirname;
}

/**
 * Servidor HTTP embebido.
 * Sirve los archivos de la app bajo http://127.0.0.1:PORT/
 *
 * ✅ Esto resuelve AMBOS problemas:
 *   - Puter.js: rechaza file://, acepta http://
 *   - Firebase Auth: rechaza file://, acepta http://
 *
 * Usa fs.readFile (promesas) que Electron parchea para leer dentro de .asar,
 * lo cual evita el error de createReadStream con archivos empaquetados.
 */
function startEmbeddedServer(appRoot) {
  return new Promise((resolve) => {
    localServer = http.createServer(async (req, res) => {
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

      const filePath = path.join(appRoot, reqPath);

      // Seguridad: no salir del directorio de la app
      if (!filePath.startsWith(appRoot)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      try {
        // fs.readFile funciona con rutas dentro de .asar (Electron lo parchea)
        const data = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      } catch (e) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      }
    });

    localServer.listen(PORT, '127.0.0.1', () => {
      console.log(`[PuterLab] Servidor HTTP embebido activo → http://127.0.0.1:${PORT}/`);
      resolve();
    });

    localServer.on('error', (err) => {
      console.error(`[PuterLab] Error servidor HTTP: ${err.message}`);
      resolve(); // no bloquear el inicio
    });
  });
}

async function createWindow() {
  const APP_ROOT = getAppRoot();
  await startEmbeddedServer(APP_ROOT);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'PuterLab Nexus IDE',
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      // Permitir almacenamiento web local desde http://localhost
      // (requerido por Firebase Auth)
      webSecurity: true,
    }
  });

  // ✅ Cargar desde http://127.0.0.1 (no file://)
  // Esto satisface tanto a Puter.js como a Firebase Auth
  mainWindow.loadURL(`http://127.0.0.1:${PORT}/index.html`);
}

app.whenReady().then(async () => {
  await createWindow();

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
