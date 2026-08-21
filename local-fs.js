// local-fs.js — Real local folder access via the File System Access API.
// Works in Chromium browsers (Chrome/Edge/Brave/Opera) after the user grants permission.
// In the desktop (Electron) build, a native bridge (window.puterlabNative) is used instead.

export const localFS = {
  rootHandle: null,      // FileSystemDirectoryHandle (browser)
  rootName: null,
  native: null,          // native bridge (Electron)
  mode: 'none',          // 'none' | 'browser' | 'native'
};

export function isBrowserFSSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}
export function hasNativeBridge() {
  return typeof window !== 'undefined' && !!window.puterlabNative;
}

// ---------- Open a folder ----------
export async function openLocalFolder() {
  if (hasNativeBridge()) {
    const res = await window.puterlabNative.openFolder();
    if (res && res.path) {
      localFS.native = window.puterlabNative;
      localFS.mode = 'native';
      localFS.rootName = res.name || res.path;
      localFS.rootPath = res.path;
      return { name: localFS.rootName, path: res.path };
    }
    return null;
  }
  if (!isBrowserFSSupported()) {
    throw new Error('Tu navegador no soporta acceso a carpetas locales. Usa Chrome, Edge o la app de escritorio.');
  }
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  localFS.rootHandle = handle;
  localFS.rootName = handle.name;
  localFS.mode = 'browser';
  return { name: handle.name };
}

export function closeLocalFolder() {
  localFS.rootHandle = null; localFS.rootName = null; localFS.native = null;
  localFS.rootPath = null; localFS.mode = 'none';
}

export function isOpen() { return localFS.mode !== 'none'; }

// ---------- List the tree ----------
// Returns a flat array: [{ path, kind: 'file'|'dir' }]
export async function listLocal(maxEntries = 4000) {
  if (localFS.mode === 'native') {
    return await localFS.native.listTree(localFS.rootPath, maxEntries);
  }
  if (localFS.mode === 'browser') {
    const out = [];
    async function walk(dir, prefix, depth) {
      if (out.length > maxEntries || depth > 12) return;
      for await (const [name, handle] of dir.entries()) {
        if (name.startsWith('.git') || name === 'node_modules') { out.push({ path: prefix + name, kind: 'dir', skipped: true }); continue; }
        const path = prefix + name;
        if (handle.kind === 'directory') {
          out.push({ path, kind: 'dir' });
          await walk(handle, path + '/', depth + 1);
        } else {
          out.push({ path, kind: 'file' });
        }
        if (out.length > maxEntries) return;
      }
    }
    await walk(localFS.rootHandle, '', 0);
    return out;
  }
  return [];
}

// ---------- Read a file ----------
export async function readLocal(path) {
  if (localFS.mode === 'native') return await localFS.native.readFile(joinNative(path));
  if (localFS.mode === 'browser') {
    const fh = await resolveFileHandle(path, false);
    if (!fh) return null;
    const file = await fh.getFile();
    return await file.text();
  }
  return null;
}

// ---------- Write a file (create dirs as needed) ----------
export async function writeLocal(path, content) {
  if (localFS.mode === 'native') return await localFS.native.writeFile(joinNative(path), content);
  if (localFS.mode === 'browser') {
    const fh = await resolveFileHandle(path, true);
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
    return true;
  }
  return false;
}

// ---------- Delete ----------
export async function deleteLocal(path) {
  if (localFS.mode === 'native') return await localFS.native.deletePath(joinNative(path));
  if (localFS.mode === 'browser') {
    const parts = path.split('/').filter(Boolean);
    const name = parts.pop();
    let dir = localFS.rootHandle;
    for (const p of parts) dir = await dir.getDirectoryHandle(p);
    await dir.removeEntry(name, { recursive: true });
    return true;
  }
  return false;
}

// ---------- Create folder ----------
export async function mkdirLocal(path) {
  if (localFS.mode === 'native') return await localFS.native.mkdir(joinNative(path));
  if (localFS.mode === 'browser') {
    const parts = path.split('/').filter(Boolean);
    let dir = localFS.rootHandle;
    for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
    return true;
  }
  return false;
}

// ---------- helpers (browser) ----------
async function resolveFileHandle(path, create) {
  const parts = path.split('/').filter(Boolean);
  const name = parts.pop();
  let dir = localFS.rootHandle;
  for (const p of parts) {
    dir = await dir.getDirectoryHandle(p, { create });
  }
  try {
    return await dir.getFileHandle(name, { create });
  } catch (e) { return null; }
}

function joinNative(path) {
  const sep = (localFS.rootPath && localFS.rootPath.includes('\\')) ? '\\' : '/';
  return localFS.rootPath.replace(/[\\/]$/, '') + sep + path.replace(/\//g, sep);
}
