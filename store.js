// store.js — Virtual file system persisted in Puter KV (per-user) or localStorage fallback
import { createIcons, icons } from 'https://cdn.jsdelivr.net/npm/lucide@latest/+esm';
export { createIcons, icons };

const KEY = 'puterlab_project_v1';

export const state = {
  files: {},        // path -> { content }
  folders: {},      // path -> true (explicit empty folders)
  signedIn: false,
};

let saveTimer = null;

function usePuter() {
  return state.signedIn && typeof puter !== 'undefined' && puter.kv;
}

export async function loadProject() {
  let raw = null;
  try {
    if (usePuter()) raw = await puter.kv.get(KEY);
  } catch (e) { raw = null; }
  if (!raw) { try { raw = localStorage.getItem(KEY); } catch (e) {} }
  if (raw) {
    try {
      const data = JSON.parse(raw);
      state.files = data.files || {};
      state.folders = data.folders || {};
    } catch (e) { seed(); }
  } else {
    seed();
  }
}

export function saveProject() {
  const data = JSON.stringify({ files: state.files, folders: state.folders });
  try { localStorage.setItem(KEY, data); } catch (e) {}
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (usePuter()) { try { await puter.kv.set(KEY, data); } catch (e) {} }
  }, 400);
}

function seed() {
  state.files = {
    'index.html': { content:
`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Mi App</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1 id="t">Hola desde PuterLab 👋</h1>
  <button id="b">Púlsame</button>
  <script src="app.js"><\/script>
</body>
</html>` },
    'style.css': { content:
`body{font-family:system-ui;display:grid;place-content:center;height:100vh;margin:0;background:#0d0f16;color:#eee;gap:16px}
button{padding:10px 18px;border:0;border-radius:8px;background:#6366f1;color:#fff;font-size:15px;cursor:pointer}` },
    'app.js': { content:
`let n = 0;
document.getElementById('b').addEventListener('click', () => {
  n++;
  document.getElementById('t').textContent = 'Clicks: ' + n;
});` },
    'README.md': { content: '# Mi proyecto\n\nEditado en PuterLab IDE. Usa el agente de IA para crear código por ti.' },
  };
  state.folders = {};
}

// ---- File ops ----
export function normalize(p) { return p.replace(/^\/+/, '').replace(/\/+/g, '/').trim(); }

export function writeFile(path, content) {
  path = normalize(path);
  if (!path) return;
  state.files[path] = { content: content ?? '' };
  saveProject();
}

export function readFile(path) {
  path = normalize(path);
  return state.files[path] ? state.files[path].content : null;
}

export function deleteFile(path) {
  path = normalize(path);
  delete state.files[path];
  // delete folder contents
  Object.keys(state.files).forEach(f => { if (f.startsWith(path + '/')) delete state.files[f]; });
  Object.keys(state.folders).forEach(f => { if (f === path || f.startsWith(path + '/')) delete state.folders[f]; });
  saveProject();
}

export function renameFile(oldP, newP) {
  oldP = normalize(oldP); newP = normalize(newP);
  if (!newP || state.files[newP]) return false;
  if (state.files[oldP]) {
    state.files[newP] = state.files[oldP];
    delete state.files[oldP];
    saveProject();
    return true;
  }
  return false;
}

export function makeFolder(path) {
  path = normalize(path);
  if (path) { state.folders[path] = true; saveProject(); }
}

export function exists(path) { path = normalize(path); return !!state.files[path]; }

// Build a nested tree object from flat paths
export function buildTree() {
  const root = { name: '', dirs: {}, files: [] };
  const ensureDir = (parts) => {
    let node = root;
    for (const part of parts) {
      if (!node.dirs[part]) node.dirs[part] = { name: part, dirs: {}, files: [] };
      node = node.dirs[part];
    }
    return node;
  };
  Object.keys(state.folders).forEach(f => ensureDir(f.split('/')));
  Object.keys(state.files).sort().forEach(path => {
    const parts = path.split('/');
    const fname = parts.pop();
    const dir = ensureDir(parts);
    dir.files.push({ name: fname, path });
  });
  return root;
}
