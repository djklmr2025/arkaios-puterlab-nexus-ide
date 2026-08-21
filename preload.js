const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('puterlabNative', {
  isElectron: true,
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  listTree: (rootPath, maxEntries) => ipcRenderer.invoke('fs:listTree', { rootPath, maxEntries }),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', { filePath, content }),
  deletePath: (targetPath) => ipcRenderer.invoke('fs:deletePath', targetPath),
  mkdir: (dirPath) => ipcRenderer.invoke('fs:mkdir', dirPath),
  execCommand: (command, cwd) => ipcRenderer.invoke('os:execCommand', { command, cwd })
});
