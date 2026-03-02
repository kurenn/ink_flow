const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

let mainWindow;
const workspaceRoot = process.cwd();
let pendingOpenFilePath = null;
const updaterState = {
  configured: false,
  checking: false,
};

function isProbablyFilePath(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('-')) {
    return false;
  }

  if (/^(https?|file):\/\//i.test(trimmed)) {
    return false;
  }

  if (!isMarkdownFile(path.basename(trimmed))) {
    return false;
  }

  return fsSync.existsSync(trimmed) && fsSync.statSync(trimmed).isFile();
}

function getFilePathFromArgv(argv = []) {
  for (const arg of argv) {
    if (isProbablyFilePath(arg)) {
      return path.resolve(arg);
    }
  }

  return null;
}

function inferRepositoryFeed() {
  try {
    const packageJsonPath = path.join(app.getAppPath(), 'package.json');
    const pkg = JSON.parse(fsSync.readFileSync(packageJsonPath, 'utf8'));
    const url = String(pkg?.repository?.url || '').trim();
    const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/i);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  } catch {
    // Ignore package repository parse errors and fall back to env-based config.
  }

  return null;
}

function getUpdateFeedConfig() {
  const genericUrl = String(process.env.INKFLOW_UPDATE_URL || '').trim();
  if (genericUrl) {
    return { provider: 'generic', url: genericUrl };
  }

  const owner = String(process.env.INKFLOW_UPDATE_OWNER || '').trim();
  const repo = String(process.env.INKFLOW_UPDATE_REPO || '').trim();
  if (owner && repo) {
    return { provider: 'github', owner, repo, private: false };
  }

  const inferred = inferRepositoryFeed();
  if (inferred) {
    return { provider: 'github', owner: inferred.owner, repo: inferred.repo, private: false };
  }

  return null;
}

function sendUpdateStatus(payload) {
  if (!mainWindow) {
    return;
  }

  mainWindow.webContents.send('app:update-status', payload);
}

async function readFilePayload(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return null;
  }

  const resolvedPath = path.resolve(filePath);
  if (!fsSync.existsSync(resolvedPath) || !fsSync.statSync(resolvedPath).isFile()) {
    return null;
  }

  const content = await fs.readFile(resolvedPath, 'utf8');
  return {
    filePath: resolvedPath,
    content,
  };
}

async function openFileInRenderer(filePath) {
  const payload = await readFilePayload(filePath);
  if (!payload) {
    return null;
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingOpenFilePath = payload.filePath;
    return payload;
  }

  if (mainWindow.webContents.isLoading()) {
    pendingOpenFilePath = payload.filePath;
    return payload;
  }

  mainWindow.webContents.send('menu:open-file', payload);
  return payload;
}

function configureAutoUpdater() {
  if (!app.isPackaged || updaterState.configured) {
    return;
  }

  const feed = getUpdateFeedConfig();
  if (!feed) {
    sendUpdateStatus({
      type: 'info',
      message: 'Update feed is not configured.',
    });
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.setFeedURL(feed);

  autoUpdater.on('checking-for-update', () => {
    updaterState.checking = true;
    sendUpdateStatus({ type: 'checking', message: 'Checking for updates...' });
  });

  autoUpdater.on('update-available', async (info) => {
    sendUpdateStatus({
      type: 'available',
      message: `Update ${info.version} is available. Downloading...`,
      version: info.version,
    });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      sendUpdateStatus({
        type: 'error',
        message: `Update download failed: ${error?.message || String(error)}`,
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    updaterState.checking = false;
    sendUpdateStatus({
      type: 'up-to-date',
      message: `You are up to date (${info?.version || app.getVersion()}).`,
      version: info?.version || app.getVersion(),
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Number.isFinite(progress?.percent) ? progress.percent.toFixed(1) : '0.0';
    sendUpdateStatus({
      type: 'downloading',
      message: `Downloading update... ${percent}%`,
      percent: progress?.percent || 0,
    });
  });

  autoUpdater.on('update-downloaded', async (info) => {
    updaterState.checking = false;
    sendUpdateStatus({
      type: 'downloaded',
      message: `Update ${info.version} downloaded.`,
      version: info.version,
    });

    if (!mainWindow) {
      return;
    }

    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Install and Restart', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update Ready',
      message: `Inkflow ${info.version} is ready to install.`,
      detail: 'Restart now to apply the update.',
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', (error) => {
    updaterState.checking = false;
    sendUpdateStatus({
      type: 'error',
      message: `Update check failed: ${error?.message || String(error)}`,
    });
  });

  updaterState.configured = true;
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    return {
      ok: false,
      message: 'Update checks are available in packaged builds only.',
    };
  }

  configureAutoUpdater();
  if (!updaterState.configured) {
    return {
      ok: false,
      message: 'Update feed is not configured. Set INKFLOW_UPDATE_URL or INKFLOW_UPDATE_OWNER/INKFLOW_UPDATE_REPO.',
    };
  }

  if (updaterState.checking) {
    return {
      ok: true,
      message: 'Already checking for updates...',
    };
  }

  try {
    updaterState.checking = true;
    await autoUpdater.checkForUpdates();
    return {
      ok: true,
      message: 'Checking for updates...',
    };
  } catch (error) {
    updaterState.checking = false;
    return {
      ok: false,
      message: `Update check failed: ${error?.message || String(error)}`,
    };
  }
}

function shouldIgnorePath(name) {
  return name.startsWith('.') || name === 'node_modules' || name === 'dist';
}

function isMarkdownFile(name) {
  return /\.(md|markdown|mdown|mkd|txt)$/i.test(name);
}

function isImageFile(name) {
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name);
}

function isInsideWorkspace(targetPath) {
  const relative = path.relative(workspaceRoot, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

async function ensureWritableDirectory(dirPath) {
  if (!dirPath) {
    return false;
  }

  try {
    await fs.mkdir(dirPath, { recursive: true });
    const probe = path.join(dirPath, `.inkflow-write-${Date.now()}.tmp`);
    await fs.writeFile(probe, 'ok', 'utf8');
    await fs.unlink(probe);
    return true;
  } catch {
    return false;
  }
}

async function resolveImageBaseDirectory(activeFilePath) {
  if (activeFilePath && path.isAbsolute(activeFilePath)) {
    const activeDir = path.dirname(activeFilePath);
    if (await ensureWritableDirectory(activeDir)) {
      return activeDir;
    }
  }

  const normalizedWorkspaceRoot = path.resolve(workspaceRoot);
  if (await ensureWritableDirectory(normalizedWorkspaceRoot)) {
    return normalizedWorkspaceRoot;
  }

  const documentsFallback = path.join(app.getPath('documents'), 'Inkflow');
  await fs.mkdir(documentsFallback, { recursive: true });
  return documentsFallback;
}

async function getImageImportDestination(sourceName, activeFilePath) {
  if (!sourceName || !isImageFile(sourceName)) {
    return null;
  }

  const markdownBaseDir = await resolveImageBaseDirectory(activeFilePath);
  const assetsDir = path.join(markdownBaseDir, 'assets');
  await fs.mkdir(assetsDir, { recursive: true });

  const ext = path.extname(sourceName);
  const rawStem = path.basename(sourceName, ext);
  const safeStem = rawStem.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '') || 'image';

  let candidateName = `${safeStem}${ext.toLowerCase()}`;
  let candidatePath = path.join(assetsDir, candidateName);
  let counter = 1;
  while (await fileExists(candidatePath)) {
    candidateName = `${safeStem}-${counter}${ext.toLowerCase()}`;
    candidatePath = path.join(assetsDir, candidateName);
    counter += 1;
  }

  return { candidateName, candidatePath, markdownBaseDir };
}

function buildImportedImageResult(candidatePath, candidateName, activeFilePath, markdownBaseDir) {
  const referenceBaseDir = activeFilePath && path.isAbsolute(activeFilePath)
    ? path.dirname(activeFilePath)
    : markdownBaseDir;
  const markdownPath = path.relative(referenceBaseDir, candidatePath);

  return {
    filePath: candidatePath,
    fileName: candidateName,
    markdownPath: toPosixPath(markdownPath),
  };
}

async function importWorkspaceImage(sourcePath, activeFilePath) {
  if (!sourcePath || typeof sourcePath !== 'string') {
    return null;
  }

  const sourceName = path.basename(sourcePath);
  const destination = await getImageImportDestination(sourceName, activeFilePath);
  if (!destination) {
    return null;
  }

  await fs.copyFile(sourcePath, destination.candidatePath);
  return buildImportedImageResult(
    destination.candidatePath,
    destination.candidateName,
    activeFilePath,
    destination.markdownBaseDir,
  );
}

async function importWorkspaceImageData(bytes, fileName, activeFilePath) {
  const sourceName = typeof fileName === 'string' ? fileName : '';
  const destination = await getImageImportDestination(sourceName, activeFilePath);
  if (!destination || !bytes) {
    return null;
  }

  const contentBuffer = Buffer.isBuffer(bytes)
    ? bytes
    : Array.isArray(bytes)
      ? Buffer.from(bytes)
    : ArrayBuffer.isView(bytes)
      ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : Buffer.from(bytes);

  await fs.writeFile(destination.candidatePath, contentBuffer);
  return buildImportedImageResult(
    destination.candidatePath,
    destination.candidateName,
    activeFilePath,
    destination.markdownBaseDir,
  );
}

async function collectMarkdownFiles(targetDir, files = []) {
  const entries = await fs.readdir(targetDir, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldIgnorePath(entry.name)) {
      continue;
    }

    const absolutePath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdownFiles(absolutePath, files);
      continue;
    }

    if (entry.isFile() && isMarkdownFile(entry.name)) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function searchWorkspaceMarkdown(rawQuery) {
  const query = String(rawQuery || '').trim();
  if (!query) {
    return [];
  }

  const lowerQuery = query.toLowerCase();
  const files = await collectMarkdownFiles(workspaceRoot);
  const groupedResults = [];
  let totalMatches = 0;
  const maxMatches = 300;

  for (const filePath of files) {
    if (totalMatches >= maxMatches) {
      break;
    }

    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const matches = [];
    let fileMatchOrdinal = 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const lowerLine = line.toLowerCase();
      let from = 0;

      while (from <= lowerLine.length) {
        const start = lowerLine.indexOf(lowerQuery, from);
        if (start === -1) {
          break;
        }

        matches.push({
          line: lineIndex + 1,
          column: start + 1,
          ordinal: fileMatchOrdinal,
          preview: line.trim() || '(empty line)',
        });

        fileMatchOrdinal += 1;
        totalMatches += 1;
        from = start + Math.max(1, query.length);

        if (totalMatches >= maxMatches) {
          break;
        }
      }

      if (totalMatches >= maxMatches) {
        break;
      }
    }

    if (matches.length > 0) {
      groupedResults.push({
        filePath,
        relativePath: path.relative(workspaceRoot, filePath) || path.basename(filePath),
        matches,
      });
    }
  }

  return groupedResults;
}

async function createWorkspaceFileDialog(suggestedName = 'untitled.md') {
  if (!mainWindow) {
    return null;
  }

  const suggestedPath = path.join(workspaceRoot, suggestedName);
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: suggestedPath,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });

  if (canceled || !filePath || !isInsideWorkspace(filePath)) {
    return null;
  }

  await fs.writeFile(filePath, '', 'utf8');
  return { filePath, content: '' };
}

async function buildWorkspaceTree(targetDir, depth = 0, maxDepth = 4) {
  const entries = await fs.readdir(targetDir, { withFileTypes: true });
  const nodes = [];

  for (const entry of entries) {
    if (shouldIgnorePath(entry.name)) {
      continue;
    }

    const absolutePath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      const children = depth < maxDepth ? await buildWorkspaceTree(absolutePath, depth + 1, maxDepth) : [];
      if (children.length > 0) {
        nodes.push({
          type: 'directory',
          name: entry.name,
          path: absolutePath,
          children,
        });
      }
      continue;
    }

    if (entry.isFile() && isMarkdownFile(entry.name)) {
      nodes.push({
        type: 'file',
        name: entry.name,
        path: absolutePath,
      });
    }
  }

  nodes.sort((a, b) => {
    if (a.type === b.type) {
      return a.name.localeCompare(b.name);
    }
    return a.type === 'directory' ? -1 : 1;
  });

  return nodes;
}

function createWindow() {
  const appIconPath = path.join(workspaceRoot, 'build/icon.png');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#f4f5f7',
    ...(fsSync.existsSync(appIconPath) ? { icon: appIconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.webContents.on('did-finish-load', async () => {
    if (!pendingOpenFilePath) {
      return;
    }

    const queuedPath = pendingOpenFilePath;
    pendingOpenFilePath = null;
    await openFileInRenderer(queuedPath);
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  buildMenu();
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New File',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu:new-file'),
        },
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await openFileDialog();
            if (result) {
              mainWindow.webContents.send('menu:open-file', result);
            }
          },
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('menu:save-file'),
        },
        {
          label: 'Save As',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('menu:save-file-as'),
        },
        { type: 'separator' },
        { role: process.platform === 'darwin' ? 'close' : 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find in Workspace',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => mainWindow.webContents.send('menu:focus-search'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => mainWindow.webContents.send('menu:toggle-sidebar'),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggledevtools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates',
          accelerator: 'CmdOrCtrl+Shift+U',
          click: async () => {
            const result = await checkForUpdates();
            sendUpdateStatus({
              type: result.ok ? 'info' : 'error',
              message: result.message,
            });
          },
        },
      ],
    },
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function openFileDialog() {
  if (!mainWindow) {
    return null;
  }

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  return readFilePayload(filePaths[0]);
}

ipcMain.handle('file:open', openFileDialog);

ipcMain.handle('file:open-path', async (_, payload) => {
  return readFilePayload(payload?.filePath);
});

ipcMain.handle('file:save', async (_, payload) => {
  const { filePath, content } = payload;

  if (!filePath) {
    return null;
  }

  await fs.writeFile(filePath, content, 'utf8');
  return { filePath };
});

ipcMain.handle('file:save-as', async (_, payload) => {
  if (!mainWindow) {
    return null;
  }

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: payload?.suggestedPath,
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Text', extensions: ['txt'] },
    ],
  });

  if (canceled || !filePath) {
    return null;
  }

  await fs.writeFile(filePath, payload?.content ?? '', 'utf8');
  return { filePath };
});

ipcMain.handle('workspace:get-tree', async () => {
  const children = await buildWorkspaceTree(workspaceRoot);
  return {
    type: 'directory',
    name: path.basename(workspaceRoot) || workspaceRoot,
    path: workspaceRoot,
    children,
  };
});

ipcMain.handle('workspace:open-file', async (_, payload) => {
  if (!payload?.filePath || !isInsideWorkspace(payload.filePath)) {
    return null;
  }

  const content = await fs.readFile(payload.filePath, 'utf8');
  return {
    filePath: payload.filePath,
    content,
  };
});

ipcMain.handle('workspace:create-file', async (_, payload) => {
  const suggestedName = payload?.suggestedName || 'untitled.md';
  return createWorkspaceFileDialog(suggestedName);
});

ipcMain.handle('workspace:search', async (_, payload) => {
  return searchWorkspaceMarkdown(payload?.query);
});

ipcMain.handle('workspace:import-image', async (_, payload) => {
  return importWorkspaceImage(payload?.sourcePath, payload?.activeFilePath);
});

ipcMain.handle('workspace:import-image-data', async (_, payload) => {
  return importWorkspaceImageData(payload?.bytes, payload?.fileName, payload?.activeFilePath);
});

ipcMain.handle('app:check-for-updates', async () => {
  return checkForUpdates();
});

app.whenReady().then(() => {
  createWindow();
  configureAutoUpdater();

  const startupFilePath = getFilePathFromArgv(process.argv.slice(1));
  if (startupFilePath) {
    pendingOpenFilePath = startupFilePath;
  }

  if (app.isPackaged) {
    setTimeout(() => {
      checkForUpdates().catch(() => {});
    }, 9000);
  }

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

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_, commandLine) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }

    const filePath = getFilePathFromArgv(commandLine);
    if (filePath) {
      openFileInRenderer(filePath).catch(() => {});
    }
  });
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (!filePath) {
    return;
  }

  openFileInRenderer(filePath).catch(() => {});
});
