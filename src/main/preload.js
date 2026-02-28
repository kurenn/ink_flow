const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fileApi', {
  openFile: () => ipcRenderer.invoke('file:open'),
  saveFile: (filePath, content) => ipcRenderer.invoke('file:save', { filePath, content }),
  saveFileAs: (content, suggestedPath) => ipcRenderer.invoke('file:save-as', { content, suggestedPath }),
  onOpenFileFromMenu: (callback) => ipcRenderer.on('menu:open-file', (_, payload) => callback(payload)),
  onSaveFileFromMenu: (callback) => ipcRenderer.on('menu:save-file', callback),
  onSaveAsFromMenu: (callback) => ipcRenderer.on('menu:save-file-as', callback),
  onTogglePreviewFromMenu: (callback) => ipcRenderer.on('menu:toggle-preview', callback),
});
