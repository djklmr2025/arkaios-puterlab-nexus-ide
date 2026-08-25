// app.js — PuterLab IDE main controller
import {
  state, loadProject, saveProject, writeFile, readFile, deleteFile,
  renameFile, makeFolder, exists, buildTree, normalize, createIcons, icons
} from './store.js';
import {
  localFS, isBrowserFSSupported, hasNativeBridge, openLocalFolder, closeLocalFolder,
  isOpen as localOpen, listLocal, readLocal, writeLocal, deleteLocal, mkdirLocal
} from './local-fs.js';

// ---------- OS / environment detection ----------
const ENV = detectEnv();
function detectEnv() {
  const ua = (navigator.userAgent || '').toLowerCase();
  const plat = (navigator.platform || '').toLowerCase();
  let os = 'desconocido', shell = 'shell';
  if (/win/.test(plat) || /windows/.test(ua)) { os = 'Windows'; shell = 'PowerShell'; }
  else if (/mac/.test(plat) || /mac os/.test(ua)) { os = 'macOS'; shell = 'zsh'; }
  else if (/linux/.test(plat) || /linux|x11/.test(ua)) { os = 'Linux'; shell = 'bash'; }
  else if (/android/.test(ua)) { os = 'Android'; shell = 'sh'; }
  else if (/iphone|ipad/.test(ua)) { os = 'iOS'; shell = 'sh'; }
  const isDesktop = hasNativeBridge();
  const browserFS = isBrowserFSSupported();
  return { os, shell, isDesktop, browserFS };
}

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
function refreshIcons(){ createIcons({ icons }); }

// ---------- App state ----------
let openTabs = [];        // [path]
let activeTab = null;     // path
const collapsed = new Set(); // collapsed folder paths

// Source mode: 'virtual' (Puter KV / local storage) or 'local' (real folder on disk)
let sourceMode = 'virtual';
let localEntries = [];    // flat [{path, kind}] when in local mode
const localCache = {};    // path -> content (loaded lazily)

// ================= Auth =================
async function initAuth() {
  try {
    if (typeof puter !== 'undefined' && puter.auth && puter.auth.isSignedIn()) {
      state.signedIn = true;
      const u = await puter.auth.getUser();
      setAuthUI(u && u.username);
    }
  } catch (e) {}

  // Google Auth Listener (Firebase arkaios-world)
  if (window.ArkaiosAuth) {
    window.ArkaiosAuth.onAuthChange((user) => {
      const googleLoginBtn = $('#googleLoginBtn');
      const googleUserPill = $('#googleUserPill');
      const googleAvatar = $('#googleAvatar');
      const googleName = $('#googleName');
      const ideDeployAuthor = $('#ideDeployAuthor');

      if (user) {
        googleLoginBtn?.classList.add('hidden');
        googleUserPill?.classList.remove('hidden');
        if (googleAvatar) googleAvatar.src = user.photoURL || 'https://www.gstatic.com/images/branding/product/1x/avatar_square_blue_512dp.png';
        if (googleName) googleName.textContent = user.displayName || user.email.split('@')[0];
        if (ideDeployAuthor) ideDeployAuthor.value = (user.displayName || user.email.split('@')[0]).toLowerCase().replace(/[^a-z0-9]/g, '');
      } else {
        googleLoginBtn?.classList.remove('hidden');
        googleUserPill?.classList.add('hidden');
      }
    });

    $('#googleLoginBtn')?.addEventListener('click', async () => {
      try {
        await window.ArkaiosAuth.signInWithGoogle();
      } catch(e) {
        toast(`✖ Error Google: ${e.message}`);
      }
    });

    $('#googleLogoutBtn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.ArkaiosAuth.signOut();
      window.location.href = 'portal.html?status=logged_out';
    });
  }
}
function setAuthUI(username) {
  const label = $('#authLabel');
  const btn = $('#authBtn');
  if (state.signedIn) {
    label.textContent = username || 'Conectado';
    btn.querySelector('[data-lucide]').setAttribute('data-lucide', 'log-out');
    $('#storeStatus').textContent = 'Nube Puter (sincronizado)';
  } else {
    label.textContent = 'Entrar';
    $('#storeStatus').textContent = 'Almacenamiento local';
  }
  refreshIcons();
}
$('#authBtn').addEventListener('click', async () => {
  if (state.signedIn) {
    try { await puter.auth.signOut(); } catch (e) {}
    state.signedIn = false; setAuthUI();
    toast('Sesión cerrada. Guardando en local.');
    return;
  }
  try {
    await puter.auth.signIn();
    state.signedIn = true;
    const u = await puter.auth.getUser();
    setAuthUI(u && u.username);
    await loadProject();
    renderTree(); toast('Conectado a Puter ☁️');
  } catch (e) { toast('No se pudo iniciar sesión'); }
});

// ================= File tree =================
function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = { html:'file-code', htm:'file-code', css:'file-code', js:'file-code',
    json:'braces', md:'file-text', txt:'file-text', svg:'image', png:'image', jpg:'image',
    ts:'file-code', py:'file-code' };
  return map[ext] || 'file';
}
function langOf(name){
  const ext = name.split('.').pop().toLowerCase();
  return ({html:'html',htm:'html',css:'css',js:'javascript',json:'json',md:'markdown',ts:'typescript',py:'python'})[ext]||'texto';
}

function buildLocalTree() {
  const root = { name:'', dirs:{}, files:[] };
  const ensureDir = (parts) => { let n=root; for(const p of parts){ if(!n.dirs[p]) n.dirs[p]={name:p,dirs:{},files:[]}; n=n.dirs[p]; } return n; };
  localEntries.forEach(e => {
    const parts = e.path.split('/').filter(Boolean);
    if (e.kind === 'dir') ensureDir(parts);
    else { const fname = parts.pop(); ensureDir(parts).files.push({ name:fname, path:e.path }); }
  });
  return root;
}

function renderTree() {
  const tree = sourceMode === 'local' ? buildLocalTree() : buildTree();
  const container = $('#fileTree');
  container.innerHTML = '';
  renderNode(tree, '', container, 0);
  const empty = sourceMode === 'local' ? localEntries.length === 0 : Object.keys(state.files).length === 0;
  if (empty) {
    container.innerHTML = `<div class="text-muted text-xs px-4 py-3">${sourceMode==='local'?'Carpeta vacía':'Sin archivos. Crea uno con +'}</div>`;
  }
  refreshIcons();
}

function renderNode(node, prefix, container, depth) {
  // folders first
  Object.keys(node.dirs).sort().forEach(dirName => {
    const path = prefix ? prefix + '/' + dirName : dirName;
    const isCol = collapsed.has(path);
    const row = document.createElement('div');
    row.className = 'tree-item';
    row.style.paddingLeft = (8 + depth * 12) + 'px';
    row.innerHTML = `<i data-lucide="chevron-${isCol?'right':'down'}" class="w-3.5 h-3.5 text-muted shrink-0"></i>
      <i data-lucide="folder" class="w-4 h-4 text-brand2 shrink-0"></i>
      <span class="name">${dirName}</span>
      <span class="actions"><button data-act="newin" title="Nuevo aquí"><i data-lucide="plus" class="w-3 h-3"></i></button>
      <button data-act="delfolder" title="Eliminar"><i data-lucide="trash-2" class="w-3 h-3"></i></button></span>`;
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-act]')) return;
      if (isCol) collapsed.delete(path); else collapsed.add(path);
      renderTree();
    });
    row.querySelector('[data-act="newin"]').addEventListener('click', (e)=>{ e.stopPropagation(); newFilePrompt(path); });
    row.querySelector('[data-act="delfolder"]').addEventListener('click', (e)=>{ e.stopPropagation(); if(confirm('¿Eliminar carpeta "'+path+'" y su contenido?')){ deleteFile(path); closeTabsUnder(path); renderTree(); } });
    container.appendChild(row);
    if (!isCol) renderNode(node.dirs[dirName], path, container, depth + 1);
  });
  // files
  node.files.forEach(f => {
    const row = document.createElement('div');
    row.className = 'tree-item' + (f.path === activeTab ? ' active' : '');
    row.style.paddingLeft = (8 + depth * 12 + 16) + 'px';
    row.dataset.path = f.path;
    row.innerHTML = `<i data-lucide="${fileIcon(f.name)}" class="w-4 h-4 text-muted shrink-0"></i>
      <span class="name">${f.name}</span>
      <span class="actions">
        <button data-act="rename" title="Renombrar"><i data-lucide="pencil" class="w-3 h-3"></i></button>
        <button data-act="del" title="Eliminar"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
      </span>`;
    row.addEventListener('click', (e) => { if (e.target.closest('[data-act]')) return; openFile(f.path); });
    row.querySelector('[data-act="rename"]').addEventListener('click', (e)=>{ e.stopPropagation(); renamePrompt(f.path); });
    row.querySelector('[data-act="del"]').addEventListener('click', (e)=>{ e.stopPropagation(); if(confirm('¿Eliminar "'+f.path+'"?')){ deleteFile(f.path); closeTab(f.path); renderTree(); } });
    container.appendChild(row);
  });
}

function newFilePrompt(dir) {
  const name = prompt('Nombre del nuevo archivo' + (dir ? ' en ' + dir : '') + ':', 'nuevo.js');
  if (!name) return;
  const path = normalize(dir ? dir + '/' + name : name);
  if (exists(path)) { toast('Ya existe ese archivo'); return; }
  writeFile(path, '');
  renderTree(); openFile(path);
}
function renamePrompt(path) {
  const parts = path.split('/'); const cur = parts.pop();
  const nn = prompt('Nuevo nombre:', cur);
  if (!nn || nn === cur) return;
  const np = normalize(parts.length ? parts.join('/') + '/' + nn : nn);
  if (renameFile(path, np)) {
    const i = openTabs.indexOf(path);
    if (i >= 0) { openTabs[i] = np; if (activeTab === path) activeTab = np; }
    renderTree(); renderTabs(); if (activeTab === np) loadEditor(np);
  } else toast('No se pudo renombrar');
}

// ================= Source-aware file helpers =================
// These route to the virtual FS or the real local folder depending on mode.
function fileExists(path) {
  if (sourceMode === 'local') return localEntries.some(e => e.kind==='file' && e.path === normalize(path));
  return exists(path);
}
function listFilePaths() {
  if (sourceMode === 'local') return localEntries.filter(e => e.kind==='file').map(e => e.path);
  return Object.keys(state.files);
}
async function readFileAsync(path) {
  path = normalize(path);
  if (sourceMode === 'local') {
    if (localCache[path] != null) return localCache[path];
    const c = await readLocal(path);
    if (c != null) localCache[path] = c;
    return c;
  }
  return readFile(path);
}
async function writeFileAny(path, content) {
  path = normalize(path);
  if (sourceMode === 'local') {
    await writeLocal(path, content);
    localCache[path] = content;
    if (!localEntries.some(e => e.path === path)) { localEntries.push({ path, kind:'file' }); }
    return;
  }
  writeFile(path, content);
}
async function deleteFileAny(path) {
  path = normalize(path);
  if (sourceMode === 'local') {
    await deleteLocal(path);
    delete localCache[path];
    localEntries = localEntries.filter(e => e.path !== path && !e.path.startsWith(path + '/'));
    return;
  }
  deleteFile(path);
}
async function mkdirAny(path) {
  if (sourceMode === 'local') { await mkdirLocal(normalize(path)); await reloadLocal(); return; }
  makeFolder(path);
}

// ================= Tabs & editor =================
const editor = $('#editor');
let editorDirty = false;

async function openFile(path) {
  if (!openTabs.includes(path)) openTabs.push(path);
  activeTab = path;
  renderTabs(); renderTree();
  await loadEditor(path);
  showView('editor');
}
async function loadEditor(path) {
  editor.value = '';
  editor.value = (await readFileAsync(path)) ?? '';
  editorDirty = false;
}
let editTimer = null;
editor.addEventListener('input', () => {
  if (!activeTab) return;
  editorDirty = true;
  clearTimeout(editTimer);
  editTimer = setTimeout(async () => { await writeFileAny(activeTab, editor.value); editorDirty = false; renderTabs(); }, 350);
});
// Tab key inserts spaces
editor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') { e.preventDefault();
    const s = editor.selectionStart, en = editor.selectionEnd;
    editor.value = editor.value.slice(0,s) + '  ' + editor.value.slice(en);
    editor.selectionStart = editor.selectionEnd = s + 2;
    editor.dispatchEvent(new Event('input'));
  }
});

function renderTabs() {
  const bar = $('#tabBar');
  bar.innerHTML = '';
  openTabs.forEach(path => {
    const name = path.split('/').pop();
    const tab = document.createElement('div');
    tab.className = 'tab' + (path === activeTab ? ' active' : '');
    tab.innerHTML = `<i data-lucide="${fileIcon(name)}" class="w-3.5 h-3.5 shrink-0"></i>
      <span class="tname">${name}</span>
      <span class="close"><i data-lucide="x" class="w-3.5 h-3.5"></i></span>`;
    tab.addEventListener('click', (e) => { if (e.target.closest('.close')) { closeTab(path); return; } openFile(path); });
    tab.querySelector('.close').addEventListener('click', (e) => { e.stopPropagation(); closeTab(path); });
    bar.appendChild(tab);
  });
  refreshIcons();
}
function closeTab(path) {
  openTabs = openTabs.filter(p => p !== path);
  if (activeTab === path) {
    activeTab = openTabs[openTabs.length - 1] || null;
    if (activeTab) { loadEditor(activeTab); } else { showView('welcome'); }
  }
  renderTabs(); renderTree();
}
function closeTabsUnder(prefix) {
  openTabs.filter(p => p === prefix || p.startsWith(prefix + '/')).forEach(closeTab);
}

function showView(v) {
  $('#welcome').classList.toggle('hidden', v !== 'welcome');
  $('#editorWrap').classList.toggle('hidden', v !== 'editor');
  $('#previewWrap').classList.toggle('hidden', v !== 'preview');
}

// ================= Preview / Run =================
function buildPreview() {
  // find an html file: active if html, else index.html, else first html
  let htmlPath = null;
  if (activeTab && activeTab.endsWith('.html')) htmlPath = activeTab;
  else if (exists('index.html')) htmlPath = 'index.html';
  else htmlPath = Object.keys(state.files).find(f => f.endsWith('.html'));
  if (!htmlPath) { toast('No hay archivo HTML para previsualizar'); return; }
  let html = readFile(htmlPath);
  // inline local css & js
  html = html.replace(/<link[^>]*href=["']([^"']+\.css)["'][^>]*>/gi, (m, href) => {
    const css = readFile(href.replace(/^\.?\//,''));
    return css != null ? `<style>${css}</style>` : m;
  });
  html = html.replace(/<script[^>]*src=["']([^"']+\.js)["'][^>]*><\/script>/gi, (m, src) => {
    const js = readFile(src.replace(/^\.?\//,''));
    return js != null ? `<script>${js}<\/script>` : m;
  });
  const frame = $('#previewFrame');
  frame.srcdoc = html;
  showView('preview');
}
$('#runBtn').addEventListener('click', buildPreview);
$('#closePreview').addEventListener('click', () => showView(activeTab ? 'editor' : 'welcome'));

// ================= Export =================
$('#fmtBtn').addEventListener('click', () => {
  const parts = Object.entries(state.files).map(([p,f]) =>
    `\n===== ${p} =====\n${f.content}`).join('\n');
  const blob = new Blob([`PuterLab export — ${new Date().toLocaleString()}\n${parts}`], {type:'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'puterlab-proyecto.txt'; a.click();
  toast('Proyecto exportado');
});

// ================= Rail / panels =================
$$('.rail-btn[data-rail]').forEach(btn => {
  btn.addEventListener('click', () => showPanel(btn.dataset.rail));
});
function showPanel(name) {
  $$('.rail-btn[data-rail]').forEach(b => b.classList.toggle('active', b.dataset.rail === name));
  $$('#sidePanel > section').forEach(s => {
    const on = s.dataset.panel === name;
    s.classList.toggle('hidden', !on);
    s.classList.toggle('flex', on);
  });
  $('#sidePanel').classList.remove('hidden');
}

// ---- Right-side agent chat panel (fixed) ----
function setChatOpen(open) {
  const panel = $('#chatPanel');
  const resizer = $('#chatResizer');
  const fab = $('#openChatFab');
  const railBtn = $('#chatToggleRail');
  panel.classList.toggle('hidden', !open);
  resizer.classList.toggle('hidden', !open);
  fab.classList.toggle('hidden', open);
  fab.classList.toggle('flex', !open);
  railBtn.classList.toggle('active', open);
  if (open) setTimeout(() => $('#chatInput')?.focus(), 60);
  try { localStorage.setItem('puterlab_chat_open', open ? '1' : '0'); } catch(e){}
}
function toggleChat() { setChatOpen($('#chatPanel').classList.contains('hidden')); }
$('#chatToggleRail').addEventListener('click', toggleChat);
$('#closeChat').addEventListener('click', () => setChatOpen(false));
$('#openChatFab').addEventListener('click', () => setChatOpen(true));

// Drag to resize the chat panel width
(function initChatResizer(){
  const resizer = $('#chatResizer');
  const panel = $('#chatPanel');
  let dragging = false;
  const onMove = (clientX) => {
    const w = Math.min(Math.max(window.innerWidth - clientX, 280), Math.min(640, window.innerWidth - 360));
    panel.style.width = w + 'px';
  };
  resizer.addEventListener('mousedown', (e) => { dragging = true; document.body.style.cursor = 'col-resize'; e.preventDefault(); });
  window.addEventListener('mousemove', (e) => { if (dragging) onMove(e.clientX); });
  window.addEventListener('mouseup', () => { dragging = false; document.body.style.cursor = ''; });
  resizer.addEventListener('touchmove', (e) => { onMove(e.touches[0].clientX); }, { passive: true });
})();

// New file buttons
$('#newFileBtn').addEventListener('click', () => newFilePrompt(''));
$('#spNewFile').addEventListener('click', () => newFilePrompt(''));
$('#spNewFolder').addEventListener('click', () => {
  const n = prompt('Nombre de la carpeta:', 'carpeta');
  if (n) { makeFolder(n); renderTree(); }
});
$('#spRefresh').addEventListener('click', async () => { if (sourceMode==='local'){ await reloadLocal(); } else { await loadProject(); } renderTree(); toast('Actualizado'); });

// ================= Local folder access =================
$('#openLocalBtn').addEventListener('click', async () => {
  try {
    const res = await openLocalFolder();
    if (!res) return;
    sourceMode = 'local';
    Object.keys(localCache).forEach(k => delete localCache[k]);
    await reloadLocal();
    openTabs = []; activeTab = null; renderTabs(); showView('welcome');
    $('#localBar').classList.remove('hidden'); $('#localBar').classList.add('flex');
    $('#localName').textContent = res.name;
    $('#openLocalLabel').textContent = 'Carpeta local abierta';
    $('#storeStatus').textContent = ENV.isDesktop ? 'Disco (app de escritorio)' : 'Carpeta local (permiso concedido)';
    renderTree();
    toast('Carpeta abierta: ' + res.name);
    termLog(`Carpeta local montada: ${res.name} — los cambios se guardan en tu disco.`, 'ok');
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    toast(e.message || 'No se pudo abrir la carpeta');
    termLog('Error al abrir carpeta: ' + (e.message||e), 'err');
  }
});
function closeLocal() {
  closeLocalFolder(); sourceMode = 'virtual'; localEntries = [];
  Object.keys(localCache).forEach(k => delete localCache[k]);
  openTabs = []; activeTab = null; renderTabs();
  $('#localBar').classList.add('hidden'); $('#localBar').classList.remove('flex');
  $('#openLocalLabel').textContent = 'Abrir carpeta local…';
  $('#storeStatus').textContent = state.signedIn ? 'Nube Puter (sincronizado)' : 'Almacenamiento local';
  renderTree(); showView('welcome');
  const first = Object.keys(state.files)[0]; if (first) openFile(first);
  toast('Carpeta local cerrada');
}
$('#localClose').addEventListener('click', closeLocal);
$('#localRefresh').addEventListener('click', async () => { await reloadLocal(); renderTree(); toast('Recargado desde disco'); });

async function reloadLocal() {
  try { localEntries = await listLocal(); }
  catch (e) { localEntries = []; termLog('Error listando: ' + (e.message||e), 'err'); }
}
$('#wcNew').addEventListener('click', () => newFilePrompt(''));
$('#wcAi').addEventListener('click', () => { setChatOpen(true); });
$('#wcDemo').addEventListener('click', loadDemo);

function loadDemo() {
  writeFile('index.html', `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Tareas</title><link rel="stylesheet" href="style.css"></head>
<body>
  <div class="card">
    <h1>✅ Lista de tareas</h1>
    <div class="row"><input id="inp" placeholder="Nueva tarea..."><button id="add">+</button></div>
    <ul id="list"></ul>
  </div>
  <script src="app.js"><\/script>
</body></html>`);
  writeFile('style.css', `*{box-sizing:border-box}body{font-family:system-ui;background:#0d0f16;color:#eee;display:grid;place-content:center;height:100vh;margin:0}
.card{background:#151823;border:1px solid #262b3d;border-radius:16px;padding:24px;width:320px}
h1{font-size:18px;margin:0 0 16px}.row{display:flex;gap:8px}
input{flex:1;padding:9px;border-radius:8px;border:1px solid #262b3d;background:#0d0f16;color:#eee}
button{padding:9px 14px;border:0;border-radius:8px;background:#6366f1;color:#fff;cursor:pointer}
ul{list-style:none;padding:0;margin:16px 0 0}li{display:flex;justify-content:space-between;padding:8px 4px;border-bottom:1px solid #262b3d}
li.done span{text-decoration:line-through;opacity:.5}li span{cursor:pointer}`);
  writeFile('app.js', `const list=document.getElementById('list'),inp=document.getElementById('inp');
function add(){if(!inp.value.trim())return;const li=document.createElement('li');
const s=document.createElement('span');s.textContent=inp.value;s.onclick=()=>li.classList.toggle('done');
const d=document.createElement('button');d.textContent='×';d.onclick=()=>li.remove();
li.append(s,d);list.appendChild(li);inp.value='';}
document.getElementById('add').onclick=add;inp.addEventListener('keydown',e=>e.key==='Enter'&&add());`);
  renderTree(); openFile('index.html'); toast('Demo cargada 🚀');
}

// Theme toggle
$('#themeBtn').addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  const dark = document.documentElement.classList.contains('dark');
  document.body.classList.toggle('bg-ink', dark);
  document.body.classList.toggle('bg-slate-100', !dark);
  document.body.classList.toggle('text-slate-200', dark);
  document.body.classList.toggle('text-slate-800', !dark);
});

// Terminal toggle
let termHidden = false;
$('#toggleTerm').addEventListener('click', () => {
  termHidden = !termHidden;
  $('#terminalPanel').style.height = termHidden ? '2rem' : '11rem';
  $('#termOut').classList.toggle('hidden', termHidden);
  $('#toggleTerm').querySelector('[data-lucide]').setAttribute('data-lucide', termHidden ? 'chevron-up' : 'chevron-down');
  refreshIcons();
});

// ================= Search =================
$('#searchInput').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  const box = $('#searchResults'); box.innerHTML = '';
  if (!q) return;
  let count = 0;
  Object.entries(state.files).forEach(([path, f]) => {
    const lines = (f.content || '').split('\n');
    lines.forEach((line, i) => {
      if (line.toLowerCase().includes(q) && count < 60) {
        count++;
        const el = document.createElement('div');
        el.className = 'px-2 py-1.5 rounded hover:bg-panel2 cursor-pointer';
        el.innerHTML = `<div class="text-[11px] text-brand2 truncate">${path}:${i+1}</div>
          <div class="text-xs text-muted truncate font-mono">${escapeHtml(line.trim()).slice(0,80)}</div>`;
        el.addEventListener('click', () => { openFile(path); });
        box.appendChild(el);
      }
    });
  });
  if (!count) box.innerHTML = '<div class="text-muted text-xs px-2 py-2">Sin resultados</div>';
});

// ================= Toast =================
let toastTimer;
function toast(msg) {
  $('#toastMsg').textContent = msg;
  $('#toast').classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.add('hidden'), 2600);
}
function escapeHtml(s){ return s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ================= AI Agent =================
import { renderMarkdown } from './md.js';
const chatLog = $('#chatLog');
let chatHistory = [];

function greetAI() {
  addAI(`¡Hola! Soy el **agente vivo** de PuterLab. Conozco tus archivos, la terminal y la vista previa, y puedo **orquestar** el proyecto por ti. Puedo:

- Charlar contigo en lenguaje natural (pregúntame lo que sea)
- Crear, editar y borrar archivos (*Modo agente*)
- Ejecutar comandos de la consola y previsualizar

Prueba: *"crea una calculadora y ábrela"* · *"explícame el app.js"* · o escribe directamente en la **terminal** de abajo en lenguaje natural.`);
}

function addUser(text) {
  const el = document.createElement('div');
  el.innerHTML = `<div class="flex justify-end"><div class="chat-bubble msg-user max-w-[85%]">${escapeHtml(text)}</div></div>`;
  chatLog.appendChild(el); scrollChat();
}
function addAI(md) {
  const el = document.createElement('div');
  el.innerHTML = `<div class="flex gap-2"><div class="w-6 h-6 rounded-md bg-brand/20 flex items-center justify-center shrink-0 mt-0.5"><i data-lucide="sparkles" class="w-3.5 h-3.5 text-brand2"></i></div><div class="chat-bubble msg-ai max-w-[88%]">${renderMarkdown(md)}</div></div>`;
  chatLog.appendChild(el); refreshIcons(); scrollChat();
  return el.querySelector('.chat-bubble');
}
function addTyping() {
  const el = document.createElement('div');
  el.innerHTML = `<div class="flex gap-2"><div class="w-6 h-6 rounded-md bg-brand/20 flex items-center justify-center shrink-0 mt-0.5"><i data-lucide="sparkles" class="w-3.5 h-3.5 text-brand2"></i></div><div class="chat-bubble msg-ai"><span class="typing"><span></span><span></span><span></span></span></div></div>`;
  chatLog.appendChild(el); refreshIcons(); scrollChat();
  return el;
}
function scrollChat(){ chatLog.scrollTop = chatLog.scrollHeight; }

async function buildContext() {
  const filePaths = listFilePaths();
  const list = filePaths.map(p => `- ${p} (${langOf(p)})`).join('\n');
  let ctx = `Archivos del proyecto (${sourceMode === 'local' ? 'Carpeta local' : 'Virtual'}):\n${list || '(vacío)'}`;
  if (activeTab) {
    const c = (await readFileAsync(activeTab)) || '';
    ctx += `\n\nArchivo abierto: ${activeTab}\n\`\`\`\n${c.slice(0, 4000)}\n\`\`\``;
  }
  return ctx;
}

const SYSTEM_AGENT = `Eres el AGENTE INTELIGENTE de PuterLab, un IDE web y de escritorio con soporte para disco local, terminal nativa (${ENV.os} / ${ENV.shell}) y la nube de Puter Cloud. Orquestas un proyecto real: conoces sus archivos, su consola/terminal integrada y su vista previa. Conversas de forma natural en español Y puedes actuar sobre la plataforma.

ENTORNO QUE CONTROLAS:
- Sistema de archivos (crear, editar, borrar archivos y carpetas).
- Una TERMINAL con comandos locales, Git y acceso al sistema.
- Vista previa que compila HTML+CSS+JS del proyecto.
- Conexión directa con Puter Cloud FS y Vercel/Puter Deploy Hub.

CÓMO ACTUAR — usa estos bloques SOLO cuando haga falta cambiar algo (si el usuario solo charla o pregunta, responde en texto normal, SIN bloques):

1) Crear o reemplazar un archivo (contenido COMPLETO, nunca "..."):
@@FILE: ruta/archivo.ext
<contenido completo>
@@END

2) Borrar un archivo:
@@DELETE: ruta/archivo.ext

3) Ejecutar un comando en la terminal del IDE (abrir, listar, previsualizar, etc.):
@@RUN: open index.html
@@RUN: run

4) Ejecutar Git commit y push automáticamente si el usuario lo solicita:
@@RUN: git add .
@@RUN: git commit -m "Actualización automática de PuterLab AI"
@@RUN: git push

REGLAS:
- Siempre acompaña las acciones con una breve explicación humana en español.
- Escribe el contenido íntegro de cada archivo que toques.
- Usa rutas relativas simples (index.html, css/style.css).
- Si el usuario te pide subir a git o respaldar en GitHub, ejecuta la secuencia de comandos Git automáticamente.
- Si el usuario pregunta por su espacio de Puter o cómo ver sus apps desplegadas, explícale que en el Deploy Hub (pestaña '☁️ Mi Espacio Puter' y botón '👁 Archivos') puede inspeccionar sus archivos y apps públicas 100% en vivo en la nube.`;

const SYSTEM_CHAT = `Eres el asistente experto del IDE web y de escritorio PuterLab. Conoces sus archivos, su terminal y su vista previa. Explicas y ayudas con código de forma clara y concisa, en español, respondiendo siempre en lenguaje natural. No modifiques archivos salvo que se te pida explícitamente.`;

// Robust AI caller with model fallback + streaming/non-streaming handling.
const MODEL_FALLBACKS = ['gpt-4o-mini', 'gpt-4.1-nano', 'gpt-4.1-mini', 'claude-sonnet-4'];
function extractText(r) {
  if (r == null) return '';
  if (typeof r === 'string') return r;
  if (r.text) return r.text;
  if (r.message) {
    const c = r.message.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(p => p.text || p.content || '').join('');
  }
  if (Array.isArray(r.content)) return r.content.map(p => p.text || '').join('');
  if (r.content && typeof r.content === 'string') return r.content;
  return '';
}

async function callAIStreaming(messages, model, onChunk) {
  const tryModels = model ? [model, ...MODEL_FALLBACKS.filter(m => m !== model)] : MODEL_FALLBACKS;
  let lastErr = null;
  for (const m of tryModels) {
    try {
      let full = '';
      const resp = await puter.ai.chat(messages, { model: m, stream: true });
      for await (const part of resp) {
        const t = extractText(part) || (part && part.text) || '';
        if (t) { full += t; onChunk(full); }
      }
      if (full.trim()) return { text: full, model: m };
      // empty stream -> try non-stream on same model
      const r = await puter.ai.chat(messages, { model: m });
      const txt = extractText(r);
      if (txt.trim()) { onChunk(txt); return { text: txt, model: m }; }
    } catch (e) {
      lastErr = e;
      // try non-streaming before moving on
      try {
        const r = await puter.ai.chat(messages, { model: m });
        const txt = extractText(r);
        if (txt.trim()) { onChunk(txt); return { text: txt, model: m }; }
      } catch (e2) { lastErr = e2; }
    }
  }
  throw lastErr || new Error('Sin respuesta del modelo');
}

async function sendChat() {
  const input = $('#chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';
  addUser(text);
  const agent = $('#agentMode').checked;
  const model = $('#modelSel').value;
  const typing = addTyping();

  if (typeof puter === 'undefined' || !puter.ai) {
    typing.remove();
    addAI('⚠️ La IA de Puter no está disponible. Recarga la página.');
    return;
  }

  const sys = agent ? SYSTEM_AGENT : SYSTEM_CHAT;
  const context = await buildContext();
  const messages = [
    { role: 'system', content: sys + '\n\n' + context },
    ...chatHistory.slice(-6),
    { role: 'user', content: text },
  ];

  let bubble = null;
  try {
    const result = await callAIStreaming(messages, model, (full) => {
      if (!bubble) { typing.remove(); bubble = addAI(''); }
      bubble.innerHTML = renderMarkdown(stripActions(full));
      scrollChat();
    });
    if (!bubble) { typing.remove(); bubble = addAI(renderMarkdown(stripActions(result.text))); }
    const full = result.text;
    chatHistory.push({ role:'user', content:text }, { role:'assistant', content: full });
    if (agent) await applyActions(full, bubble);
    else {
      // even in chat mode, honor explicit run/file actions if present
      if (/@@(FILE|DELETE|RUN):/.test(full)) await applyActions(full, bubble);
    }
  } catch (e) {
    typing.remove();
    addAI('⚠️ No pude contactar la IA en este momento. Detalle: ' + (e.message || e) + '\n\nInténtalo de nuevo o cambia de modelo arriba.');
  }
}

// Remove action blocks from display text
function stripActions(text) {
  return text
    .replace(/@@FILE:[^\n]*\n[\s\S]*?@@END/g, (m) => {
      const path = (m.match(/@@FILE:\s*([^\n]+)/) || [])[1] || 'archivo';
      return `\n<span class="file-chip">✎ ${path.trim()}</span>\n`;
    })
    .replace(/@@DELETE:\s*([^\n]+)/g, '\n<span class="file-chip">🗑 $1</span>\n')
    .replace(/@@RUN:\s*([^\n]+)/g, '\n<span class="file-chip">$ $1</span>\n')
    // hide a dangling @@FILE header that is still streaming (no @@END yet)
    .replace(/@@FILE:[^\n]*\n[\s\S]*$/g, (m) => {
      const path = (m.match(/@@FILE:\s*([^\n]+)/) || [])[1] || 'archivo';
      return `\n<span class="file-chip">✎ ${path.trim()} …</span>\n`;
    });
}

// Parse & apply @@FILE / @@DELETE actions
async function applyActions(text, bubble) {
  const created = [];
  const fileRe = /@@FILE:\s*([^\n]+)\n([\s\S]*?)@@END/g;
  let m;
  while ((m = fileRe.exec(text)) !== null) {
    const path = normalize(m[1].trim());
    let content = m[2].replace(/\n$/, '');
    // strip a fenced code block if the model wrapped content in ```
    content = content.replace(/^```[a-z]*\n/i, '').replace(/\n```\s*$/,'');
    await writeFileAny(path, content);
    created.push(path);
  }
  const delRe = /@@DELETE:\s*([^\n]+)/g;
  const deleted = [];
  while ((m = delRe.exec(text)) !== null) {
    const path = normalize(m[1].trim());
    if (fileExists(path)) { await deleteFileAny(path); closeTab(path); deleted.push(path); }
  }
  // @@RUN: agent orchestrates the terminal
  const runRe = /@@RUN:\s*([^\n]+)/g;
  const ran = [];
  const cmdsToRun = [];
  while ((m = runRe.exec(text)) !== null) { cmdsToRun.push(m[1].trim()); }
  if (cmdsToRun.length) {
    for (const c of cmdsToRun) { termLog(`› agente ejecuta: ${c}`, 'brand'); await runCommand(c, { fromAgent: true }); }
    ran.push(...cmdsToRun);
  }
  if (created.length || deleted.length || ran.length) {
    renderTree();
    if (created.length) { await openFile(created[created.length-1]); termLog(`Agente escribió ${created.length} archivo(s): ${created.join(', ')}`, 'ok'); }
    if (deleted.length) termLog(`Agente eliminó: ${deleted.join(', ')}`, 'dim');
    if (bubble) {
      const summary = document.createElement('div');
      summary.className = 'mt-2 pt-2 border-t border-edge flex flex-wrap gap-1';
      [...created.map(p=>['✎',p,'file']), ...deleted.map(p=>['🗑',p,'file']), ...ran.map(c=>['$',c,'cmd'])].forEach(([ic,p,kind])=>{
        const chip = document.createElement('button');
        chip.className = 'file-chip hover:border-brand cursor-pointer';
        chip.innerHTML = `${ic} ${escapeHtml(p)}`;
        chip.onclick = () => { if (kind === 'file' && fileExists(p)) openFile(p); };
        summary.appendChild(chip);
      });
      bubble.appendChild(summary);
    }
    scrollChat();
    if (created.length) toast(`${created.length} archivo(s) actualizados por la IA`);
    else if (ran.length) toast(`Agente ejecutó ${ran.length} comando(s)`);
  }
}

$('#chatSend').addEventListener('click', sendChat);
const chatInputEl = $('#chatInput');
chatInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); autoGrow(); }
});
// Auto-grow the fixed input (up to max-h) as the user types
function autoGrow() {
  chatInputEl.style.height = 'auto';
  chatInputEl.style.height = Math.min(chatInputEl.scrollHeight, 128) + 'px';
}
chatInputEl.addEventListener('input', autoGrow);

// New conversation
$('#clearChat').addEventListener('click', () => {
  chatHistory = [];
  chatLog.innerHTML = '';
  greetAI();
  chatInputEl.value = ''; autoGrow(); chatInputEl.focus();
});

// Quick-prompt chips
$$('.quick-chip').forEach(chip => chip.addEventListener('click', () => {
  chatInputEl.value = chip.dataset.quick;
  autoGrow(); sendChat();
}));

// ================= Terminal =================
const termOut = $('#termOut');
const termInput = $('#termInput');
let cmdHistory = []; let cmdIdx = 0;

function termLog(text, cls='') {
  const line = document.createElement('div');
  line.className = 'term-line ' + (cls?('term-'+cls):'');
  line.textContent = text;
  termOut.appendChild(line);
  termOut.scrollTop = termOut.scrollHeight;
}
function termHTML(html) {
  const line = document.createElement('div');
  line.className = 'term-line';
  line.innerHTML = html;
  termOut.appendChild(line);
  termOut.scrollTop = termOut.scrollHeight;
}

const commands = {
  help() {
    termHTML(`<span class="term-brand">Comandos disponibles (${ENV.os}):</span>`);
    termLog('  help              Muestra esta ayuda');
    termLog('  ls [dir]          Lista archivos');
    termLog('  cat <archivo>     Muestra el contenido');
    termLog('  touch <archivo>   Crea un archivo vacío');
    termLog('  mkdir <carpeta>   Crea una carpeta');
    termLog('  rm <archivo>      Elimina un archivo');
    termLog('  open <archivo>    Abre en el editor');
    termLog('  run               Previsualiza el proyecto');
    termLog('  ai <mensaje>      Pregunta al agente IA');
    termLog('  echo <texto>      Imprime texto');
    termLog('  clear             Limpia la terminal');
    termLog('  whoami            Usuario actual');
    termLog('');
    termHTML('<span class="term-brand">Lenguaje natural:</span> escribe cualquier frase (ej. "crea una landing con un botón")');
    termLog('  y el agente la interpretará y actuará sobre el proyecto.', 'dim');
  },
  async ls(args) {
    const filePaths = listFilePaths();
    const dir = args[0] ? normalize(args[0]) : '';
    const set = new Set();
    filePaths.forEach(p => {
      if (!dir || p.startsWith(dir + '/')) {
        const rest = dir ? p.slice(dir.length+1) : p;
        set.add(rest.includes('/') ? rest.split('/')[0]+'/' : rest);
      } else if (!dir && !p.includes('/')) set.add(p);
    });
    const arr = [...set].sort();
    if (!arr.length) { termLog('(vacío)', 'dim'); return; }
    arr.forEach(n => termHTML(n.endsWith('/') ? `<span class="term-brand">${n}</span>` : n));
  },
  async cat(args) {
    if (!args[0]) return termLog('uso: cat <archivo>', 'err');
    const c = await readFileAsync(args[0]);
    if (c == null) return termLog('no existe: ' + args[0], 'err');
    c.split('\n').forEach(l => termLog(l));
  },
  async touch(args) {
    if (!args[0]) return termLog('uso: touch <archivo>', 'err');
    if (fileExists(args[0])) return termLog('ya existe', 'err');
    await writeFileAny(args[0], ''); renderTree(); termLog('creado: ' + args[0], 'ok');
  },
  async mkdir(args) {
    if (!args[0]) return termLog('uso: mkdir <carpeta>', 'err');
    await mkdirAny(args[0]); renderTree(); termLog('carpeta creada: ' + args[0], 'ok');
  },
  async rm(args) {
    if (!args[0]) return termLog('uso: rm <archivo>', 'err');
    if (!fileExists(args[0])) return termLog('no existe', 'err');
    await deleteFileAny(args[0]); closeTab(normalize(args[0])); renderTree(); termLog('eliminado: ' + args[0], 'ok');
  },
  async open(args) {
    if (!args[0] || !fileExists(args[0])) return termLog('no existe', 'err');
    await openFile(normalize(args[0])); termLog('abriendo ' + args[0], 'dim');
  },
  run() { buildPreview(); termLog('ejecutando vista previa…', 'ok'); },
  echo(args) { termLog(args.join(' ')); },
  clear() { termOut.innerHTML = ''; },
  async whoami() {
    if (state.signedIn) { try { const u = await puter.auth.getUser(); termLog(u.username, 'brand'); } catch { termLog('conectado','brand'); } }
    else termLog(`invitado (${sourceMode === 'local' ? 'local' : 'virtual'})`, 'dim');
  },
  async ai(args) {
    const q = args.join(' ');
    if (!q) return termLog('uso: ai <mensaje>', 'err');
    termLog('› consultando IA…', 'dim');
    try {
      const r = await puter.ai.chat(q, { model: $('#modelSel').value });
      const t = r?.message?.content || r?.text || String(r);
      t.split('\n').forEach(l => termLog(l));
    } catch (e) { termLog('error IA: ' + (e.message||e), 'err'); }
  },
  async deploy(args) {
    const proj = args[0] || 'app';
    termLog(`› iniciando despliegue en Puter Cloud para '${proj}'...`, 'dim');
    if (typeof puter === 'undefined' || !puter.auth) {
      return termLog('error: Puter.js no disponible', 'err');
    }
    if (!puter.auth.isSignedIn()) {
      termLog('solicitando inicio de sesión en Puter...', 'dim');
      await puter.auth.signIn();
    }
    const u = await puter.auth.getUser();
    const author = (u?.username || 'arkaios').toLowerCase().replace(/[^a-z0-9]/g, '');
    const slug = `${author}-${cleanSlug(proj)}`;
    const targetFolder = '/' + slug;

    try {
      try { await puter.fs.mkdir(targetFolder); } catch(e){}
      const paths = listFilePaths();
      termLog(`guardando ${paths.length} archivo(s) en ${targetFolder}...`, 'dim');
      for (const p of paths) {
        const c = await readFileAsync(p);
        if (c != null) await puter.fs.write(targetFolder + '/' + p, c);
      }
      const site = await puter.hosting.create(slug, targetFolder);
      const fullUrl = `https://${site.subdomain || slug}.puter.site/`;
      termHTML(`<span class="term-ok">✔ Proyecto desplegado con éxito:</span> <a href="${fullUrl}" target="_blank" style="color:#a855f7;text-decoration:underline;">${fullUrl}</a>`);
    } catch(errDep) {
      termLog(`error en despliegue: ${errDep.message || errDep}`, 'err');
    }
  },
};

async function runCommand(raw, opts = {}) {
  const parts = raw.trim().split(/\s+/);
  const cmd = parts[0]; const args = parts.slice(1);
  if (!opts.silentEcho) termHTML(`<span class="term-ok">puterlab$</span> ${escapeHtml(raw)}`);
  if (!cmd) return;

  // Native Electron execution
  if (hasNativeBridge() && sourceMode === 'local' && !commands[cmd]) {
    try {
      termLog(`› shell nativa (${ENV.shell}): ${raw}`, 'dim');
      const res = await window.puterlabNative.execCommand(raw, localFS.rootPath);
      if (res.stdout) res.stdout.split('\n').forEach(l => l && termLog(l));
      if (res.stderr) res.stderr.split('\n').forEach(l => l && termLog(l, 'err'));
      await reloadLocal(); renderTree();
      return;
    } catch (e) {
      termLog('error nativo: ' + (e.message||e), 'err');
    }
  }

  if (commands[cmd]) { try { await commands[cmd](args); } catch(e){ termLog('error: '+e.message,'err'); } return; }
  // Not a fixed command: treat plain human text as a request to the live agent.
  if (opts.fromAgent) { termLog(`comando no encontrado: ${cmd}`, 'err'); return; }
  await agentFromTerminal(raw);
}

// Route natural-language terminal input to the AI agent, orchestrating the IDE.
async function agentFromTerminal(text) {
  if (typeof puter === 'undefined' || !puter.ai) { termLog('IA no disponible', 'err'); return; }
  termLog('› pensando…', 'dim');
  const context = await buildContext();
  const messages = [
    { role: 'system', content: SYSTEM_AGENT + '\n\nEstás siendo invocado desde la TERMINAL. Sé breve. ' + context },
    { role: 'user', content: text },
  ];
  try {
    const result = await callAIStreaming(messages, $('#modelSel').value, () => {});
    const full = result.text || '';
    // print the conversational part (without action blocks) to the terminal
    const spoken = full.replace(/@@FILE:[^\n]*\n[\s\S]*?@@END/g, '')
                       .replace(/@@DELETE:\s*[^\n]+/g, '')
                       .replace(/@@RUN:\s*[^\n]+/g, '').trim();
    if (spoken) spoken.split('\n').forEach(l => l.trim() && termLog(l));
    // mirror in chat + apply file/run actions
    const bubble = addAI(stripActions(full));
    chatHistory.push({ role:'user', content:text }, { role:'assistant', content: full });
    await applyActions(full, bubble);
  } catch (e) { termLog('error IA: ' + (e.message || e), 'err'); }
}

termInput.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    const v = termInput.value; termInput.value = '';
    if (v.trim()) { cmdHistory.push(v); cmdIdx = cmdHistory.length; }
    await runCommand(v);
  } else if (e.key === 'ArrowUp') {
    if (cmdIdx > 0) { cmdIdx--; termInput.value = cmdHistory[cmdIdx] || ''; }
    e.preventDefault();
  } else if (e.key === 'ArrowDown') {
    if (cmdIdx < cmdHistory.length) { cmdIdx++; termInput.value = cmdHistory[cmdIdx] || ''; }
    e.preventDefault();
  }
});
$('#clearTerm').addEventListener('click', () => termOut.innerHTML = '');
$('#termOut').addEventListener('click', () => termInput.focus());

// ================= IDE Deploy Modal =================
function cleanSlug(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

const deployModal = $('#deployModal');
const deployAuthorInp = $('#ideDeployAuthor');
const deployProjectInp = $('#ideDeployProject');
const deployUrlBox = $('#ideDeployUrl');
const deployLogBox = $('#ideDeployLogBox');

function updateIdeDeployPreview() {
  const author = cleanSlug(deployAuthorInp.value) || 'arkaios';
  const proj = cleanSlug(deployProjectInp.value) || 'lab';
  const slug = `${author}-${proj}`;
  deployUrlBox.textContent = `https://${slug}.puter.site/`;
  return slug;
}

$('#deployModalBtn')?.addEventListener('click', () => {
  deployModal.classList.remove('hidden');
  updateIdeDeployPreview();
});
$('#closeDeployModal')?.addEventListener('click', () => {
  deployModal.classList.add('hidden');
});
deployAuthorInp?.addEventListener('input', updateIdeDeployPreview);
deployProjectInp?.addEventListener('input', updateIdeDeployPreview);

$('#ideStartDeployBtn')?.addEventListener('click', async () => {
  const slug = updateIdeDeployPreview();
  const targetFolder = '/' + slug;
  deployLogBox.innerHTML = '<div class="text-brand2">▶ Iniciando despliegue en Puter Cloud...</div>';

  try {
    if (typeof puter === 'undefined' || !puter.auth) {
      deployLogBox.innerHTML += '<div class="text-red-400">Error: Puter.js no disponible.</div>';
      return;
    }
    if (!puter.auth.isSignedIn()) {
      deployLogBox.innerHTML += '<div class="text-amber-400">Solicitando inicio de sesión en Puter...</div>';
      await puter.auth.signIn();
      await initAuth();
    }

    deployLogBox.innerHTML += `<div class="text-slate-300">1/2 Creando carpeta en la nube '${targetFolder}'...</div>`;
    try { await puter.fs.mkdir(targetFolder); } catch(e){}

    const filePaths = listFilePaths();
    deployLogBox.innerHTML += `<div class="text-slate-300">2/2 Guardando ${filePaths.length} archivo(s) en puter.fs...</div>`;

    for (const p of filePaths) {
      const content = await readFileAsync(p);
      if (content != null) {
        await puter.fs.write(targetFolder + '/' + p, content);
        deployLogBox.innerHTML += `<div class="text-emerald-400">  ✔ ${targetFolder}/${p}</div>`;
      }
    }

    deployLogBox.innerHTML += `<div class="text-slate-300">Asignando subdominio '${slug}' en Puter Hosting...</div>`;
    let site = null;
    try {
      site = await puter.hosting.create(slug, targetFolder);
    } catch(errCreate) {
      if (errCreate && errCreate.message && errCreate.message.includes('already exists')) {
        try {
          if (puter.hosting.update) site = await puter.hosting.update(slug, targetFolder);
          else site = await puter.hosting.create(slug + '-app', targetFolder);
        } catch(e) {
          site = await puter.hosting.create(slug + '-app', targetFolder);
        }
      } else {
        throw errCreate;
      }
    }

    const finalSub = site ? (site.subdomain || slug) : slug;
    const cleanSub = finalSub.replace(/\.puter\.site$/i, '');
    const fullUrl = `https://${cleanSub}.puter.site/`;

    if (window.ArkaiosAuth) {
      await window.ArkaiosAuth.recordDeployment(cleanSub, targetFolder, deployAuthorInp.value, deployProjectInp.value);
    }

    deployLogBox.innerHTML += `<div class="text-emerald-400 font-bold mt-2">🎉 ¡Despliegue Exitoso!</div>`;
    deployLogBox.innerHTML += `<div><a href="${fullUrl}" target="_blank" class="text-brand2 underline font-bold">${fullUrl}</a></div>`;
    toast('🚀 Proyecto publicado con éxito en Puter Cloud');
  } catch (err) {
    deployLogBox.innerHTML += `<div class="text-red-400 mt-1">✖ Error: ${err.message || err}</div>`;
  }
});

// ================= Boot =================
async function boot() {
  refreshIcons();
  await initAuth();
  await loadProject();

  // Cargar proyecto desde Puter Cloud si viene especificado en la URL (?project=slug)
  const urlParams = new URLSearchParams(window.location.search);
  const projParam = urlParams.get('project');
  if (projParam && typeof puter !== 'undefined' && puter.fs) {
    try {
      const targetDir = '/' + projParam;
      const items = await puter.fs.readdir(targetDir);
      if (items && items.length) {
        state.files = {};
        for (const item of items) {
          if (!item.is_dir) {
            try {
              const fileObj = await puter.fs.read(targetDir + '/' + item.name);
              const txt = typeof fileObj === 'string' ? fileObj : (await fileObj.text());
              state.files[item.name] = { content: txt };
            } catch(eItem){}
          }
        }
        saveProject();
        toast(`📁 Proyecto '${projParam}' cargado desde Puter Cloud`);
      }
    } catch(eProj){}
  }

  renderTree();
  greetAI();
  termHTML('<span class="term-brand">PuterLab Terminal</span> — comandos (<span class="term-brand">help</span>) o lenguaje natural: escribe una frase y el agente actuará.');
  const first = Object.keys(state.files)[0];
  if (first) openFile(first); else showView('welcome');
  // Restore chat panel state (open by default)
  let chatOpen = true;
  try { const v = localStorage.getItem('puterlab_chat_open'); if (v === '0') chatOpen = false; } catch(e){}
  setChatOpen(chatOpen);
}
boot();
