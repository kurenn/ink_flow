const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fileApi', {
  openFile: () => ipcRenderer.invoke('file:open'),
  openFilePath: (filePath) => ipcRenderer.invoke('file:open-path', { filePath }),
  saveFile: (filePath, content) => ipcRenderer.invoke('file:save', { filePath, content }),
  saveFileAs: (content, suggestedPath) => ipcRenderer.invoke('file:save-as', { content, suggestedPath }),
  getWorkspaceTree: () => ipcRenderer.invoke('workspace:get-tree'),
  openWorkspaceFile: (filePath) => ipcRenderer.invoke('workspace:open-file', { filePath }),
  createWorkspaceFile: (suggestedName) => ipcRenderer.invoke('workspace:create-file', { suggestedName }),
  searchWorkspace: (query) => ipcRenderer.invoke('workspace:search', { query }),
  importWorkspaceImage: (sourcePath, activeFilePath) => ipcRenderer.invoke('workspace:import-image', { sourcePath, activeFilePath }),
  importWorkspaceImageData: (bytes, fileName, activeFilePath) => ipcRenderer.invoke('workspace:import-image-data', { bytes, fileName, activeFilePath }),
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  onNewFileFromMenu: (callback) => ipcRenderer.on('menu:new-file', callback),
  onOpenFileFromMenu: (callback) => ipcRenderer.on('menu:open-file', (_, payload) => callback(payload)),
  onSaveFileFromMenu: (callback) => ipcRenderer.on('menu:save-file', callback),
  onSaveAsFromMenu: (callback) => ipcRenderer.on('menu:save-file-as', callback),
  onToggleSidebarFromMenu: (callback) => ipcRenderer.on('menu:toggle-sidebar', callback),
  onFocusSearchFromMenu: (callback) => ipcRenderer.on('menu:focus-search', callback),
  onUpdateStatus: (callback) => ipcRenderer.on('app:update-status', (_, payload) => callback(payload)),
});
