import { marked } from '../../node_modules/marked/lib/marked.esm.js';
import TurndownService from '../../node_modules/turndown/lib/turndown.es.js';

const editor = document.getElementById('editor-surface');
const editorPanel = document.querySelector('.editor-panel');
const docName = document.getElementById('doc-name');
const fileMeta = document.getElementById('file-meta');
const workspace = document.getElementById('workspace');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const fileTree = document.getElementById('file-tree');
const outlineTree = document.getElementById('outline-tree');
const workspaceMeta = document.getElementById('workspace-meta');
const workspaceFolderButton = document.getElementById('workspace-folder-btn');
const sidebarButton = document.getElementById('sidebar-btn');
const themeButton = document.getElementById('theme-btn');
const updateButton = document.getElementById('update-btn');
const newButton = document.getElementById('new-btn');
const openButton = document.getElementById('open-btn');
const saveButton = document.getElementById('save-btn');
const saveAsButton = document.getElementById('save-as-btn');
const appStatus = document.getElementById('app-status');
const imageTools = document.getElementById('image-tools');
const imageAltInput = document.getElementById('image-alt-input');
const imageWidthResetButton = document.getElementById('image-width-reset-btn');
const imageResizeHandle = document.getElementById('image-resize-handle');
const commandPalette = document.getElementById('command-palette');
const commandPaletteBackdrop = document.getElementById('command-palette-backdrop');
const commandPaletteInput = document.getElementById('command-palette-input');
const commandPaletteResults = document.getElementById('command-palette-results');
const fileApi = window.fileApi;

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

turndownService.addRule('task-checkbox', {
  filter: (node) => node.nodeName === 'INPUT' && node.getAttribute('type') === 'checkbox',
  replacement: (_, node) => (node.checked ? '[x] ' : '[ ] '),
});

turndownService.addRule('img-markdown-path', {
  filter: 'img',
  replacement: (_, node) => {
    const alt = node.getAttribute('alt') || '';
    const src = node.getAttribute('data-md-src') || node.getAttribute('src') || '';
    const widthAttr = node.getAttribute('width');
    const widthStyle = (node.style?.width || '').trim();
    const widthValue = widthAttr || widthStyle;
    const escapedAlt = String(alt).replace(/"/g, '&quot;');
    const escapedSrc = String(src).replace(/"/g, '&quot;');
    if (widthValue) {
      const escapedWidth = String(widthValue).replace(/"/g, '&quot;');
      return `<img src="${escapedSrc}" alt="${escapedAlt}" width="${escapedWidth}">`;
    }
    return `![${alt}](${src})`;
  },
});

marked.setOptions({
  gfm: true,
  breaks: true,
});

let currentFilePath = '';
let currentMarkdown = '';
let isDirty = false;
let isRendering = false;
let themeMode = 'light';
let searchDebounceTimer = null;
let workspaceRootPath = '';
let workspaceTreeSnapshot = null;
let selectedImage = null;
let imageResizeState = null;
let commandPaletteItems = [];
let commandPaletteSelectedIndex = 0;
let commandPaletteOpen = false;
let commandPaletteRestoredFocus = null;
let allowWindowUnload = false;
const ZWSP = '\u200B';
const BLOCK_SELECTOR = 'p, div, li, h1, h2, h3, h4, h5, h6, blockquote';
const SUN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/><circle cx="12" cy="12" r="4"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
let statusTimer = null;

function isEditorImage(node) {
  return node instanceof HTMLImageElement && editor.contains(node);
}

function getFileName(filePath) {
  if (!filePath) {
    return 'Untitled';
  }

  return filePath.split(/[\\/]/).pop() || filePath;
}

function placeCaretAtEnd(target) {
  target.focus();
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function placeCaretInTextNode(node, offset = node.textContent.length) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertHtmlAtCaret(html) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    editor.insertAdjacentHTML('beforeend', html);
    placeCaretAtEnd(editor);
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const fragment = range.createContextualFragment(html);
  const lastNode = fragment.lastChild;
  range.insertNode(fragment);

  if (lastNode) {
    const after = document.createRange();
    after.setStartAfter(lastNode);
    after.collapse(true);
    selection.removeAllRanges();
    selection.addRange(after);
  }
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dirnameLike(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  if (idx <= 0) {
    return '';
  }
  return normalized.slice(0, idx);
}

function toFileUrl(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`;
  }
  if (normalized.startsWith('/')) {
    return `file://${encodeURI(normalized)}`;
  }
  return `file://${encodeURI(normalized)}`;
}

function isWindowsAbsolutePath(filePath) {
  return /^[a-zA-Z]:[\\/]/.test(String(filePath || ''));
}

function isLikelyAbsoluteUrl(value) {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(String(value || '')) || String(value || '').startsWith('//');
}

function resolvePathLike(baseDir, targetPath) {
  const cleanBase = String(baseDir || '').replace(/\\/g, '/');
  const cleanTarget = String(targetPath || '').replace(/\\/g, '/');
  const stack = [];
  const combined = `${cleanBase}/${cleanTarget}`;
  const absoluteUnix = combined.startsWith('/');

  for (const segment of combined.split('/')) {
    if (!segment || segment === '.') {
      continue;
    }

    if (segment === '..') {
      if (stack.length === 0) {
        continue;
      }
      if (/^[a-zA-Z]:$/.test(stack[stack.length - 1])) {
        continue;
      }
      stack.pop();
      continue;
    }

    stack.push(segment);
  }

  const joined = stack.join('/');
  if (/^[a-zA-Z]:/.test(joined)) {
    return joined;
  }

  return `${absoluteUnix ? '/' : ''}${joined}`;
}

function resolveRelativeImageSources() {
  const baseDir = currentFilePath ? dirnameLike(currentFilePath) : workspaceRootPath;
  if (!baseDir) {
    return;
  }

  const images = editor.querySelectorAll('img');
  for (const img of images) {
    const rawSrc = img.getAttribute('data-md-src') || img.getAttribute('src') || '';
    if (!rawSrc) {
      continue;
    }

    if (!img.getAttribute('data-md-src')) {
      img.setAttribute('data-md-src', rawSrc);
    }

    if (rawSrc.startsWith('data:') || rawSrc.startsWith('blob:') || rawSrc.startsWith('file://')) {
      img.setAttribute('src', rawSrc);
      continue;
    }

    if (isWindowsAbsolutePath(rawSrc) || rawSrc.startsWith('/')) {
      img.setAttribute('src', toFileUrl(rawSrc));
      continue;
    }

    if (isLikelyAbsoluteUrl(rawSrc)) {
      img.setAttribute('src', rawSrc);
      continue;
    }

    const absolutePath = resolvePathLike(baseDir, rawSrc);
    if (!absolutePath) {
      continue;
    }
    img.setAttribute('src', toFileUrl(absolutePath));
  }
}

function wireEditorImages() {
  const images = editor.querySelectorAll('img');
  for (const image of images) {
    image.setAttribute('contenteditable', 'false');
    image.setAttribute('draggable', 'false');
    image.onload = () => {
      if (image === selectedImage) {
        updateImageToolsPosition();
      }
    };
  }
}

function clearSelectedImage() {
  if (selectedImage) {
    selectedImage.classList.remove('image-selected');
  }
  selectedImage = null;
  imageResizeState = null;
  if (imageTools) {
    imageTools.hidden = true;
  }
  if (imageResizeHandle) {
    imageResizeHandle.hidden = true;
  }
}

function updateImageToolsPosition() {
  if (!isEditorImage(selectedImage)) {
    clearSelectedImage();
    return;
  }

  const imageRect = selectedImage.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const toolsWidth = imageTools?.offsetWidth || 300;
  const toolsHeight = imageTools?.offsetHeight || 42;
  const margin = 10;

  const preferredTop = imageRect.top - toolsHeight - margin;
  const fallbackTop = imageRect.bottom + margin;
  const top = preferredTop >= 8 ? preferredTop : Math.min(fallbackTop, window.innerHeight - toolsHeight - 8);
  const left = Math.min(
    Math.max(8, imageRect.left),
    Math.max(8, viewportWidth - toolsWidth - 8),
  );

  if (imageTools) {
    imageTools.style.left = `${left}px`;
    imageTools.style.top = `${top}px`;
    imageTools.hidden = false;
  }

  if (imageResizeHandle) {
    imageResizeHandle.style.left = `${Math.max(4, imageRect.right - 8)}px`;
    imageResizeHandle.style.top = `${Math.max(4, imageRect.bottom - 8)}px`;
    imageResizeHandle.hidden = false;
  }
}

function setSelectedImageWidth(widthPx) {
  if (!isEditorImage(selectedImage)) {
    return;
  }

  const editorRect = editor.getBoundingClientRect();
  const maxWidth = Math.max(120, editorRect.width - 8);
  const clamped = Math.max(80, Math.min(Math.round(widthPx), Math.round(maxWidth)));
  selectedImage.setAttribute('width', String(clamped));
  selectedImage.style.width = `${clamped}px`;
  selectedImage.style.maxWidth = '100%';
  updateImageToolsPosition();
  updateDirtyState();
}

function selectEditorImage(image) {
  if (!isEditorImage(image)) {
    clearSelectedImage();
    return;
  }

  if (selectedImage && selectedImage !== image) {
    selectedImage.classList.remove('image-selected');
  }

  selectedImage = image;
  selectedImage.classList.add('image-selected');
  if (imageAltInput) {
    imageAltInput.value = selectedImage.getAttribute('alt') || '';
  }
  updateImageToolsPosition();
  requestAnimationFrame(() => {
    updateImageToolsPosition();
  });
}

function startImageResize(event) {
  if (!isEditorImage(selectedImage)) {
    return;
  }

  event.preventDefault();
  const rect = selectedImage.getBoundingClientRect();
  imageResizeState = {
    startX: event.clientX,
    startWidth: rect.width,
  };
}

function insertImportedImage(imported) {
  if (!imported?.markdownPath) {
    return;
  }

  const alt = escapeHtml(getImageAltText(imported.fileName));
  const markdownPath = escapeHtml(imported.markdownPath);
  const src = escapeHtml(toFileUrl(imported.filePath || ''));
  const imageHtml = `<p><img src="${src}" data-md-src="${markdownPath}" alt="${alt}"></p><p><br></p>`;
  insertHtmlAtCaret(imageHtml);
  wireEditorImages();
  updateDirtyState();
  updateOutline();

  const allImages = editor.querySelectorAll('img');
  const image = allImages.length > 0 ? allImages[allImages.length - 1] : null;
  if (image) {
    selectEditorImage(image);
  }
}

function getEventElement(target) {
  if (target instanceof Element) {
    return target;
  }

  if (target instanceof Node && target.parentElement) {
    return target.parentElement;
  }

  return null;
}

function isInsideImageToolsTarget(target) {
  const element = getEventElement(target);
  return Boolean(element?.closest('#image-tools'));
}

function shouldKeepImageToolsOpen(target) {
  const element = getEventElement(target);
  if (!selectedImage) {
    return false;
  }

  if (element === imageResizeHandle) {
    return true;
  }

  if (isInsideImageToolsTarget(element)) {
    return true;
  }

  return element === selectedImage;
}

function normalizeMarkdown(markdown) {
  return (markdown || '').replace(/\r\n/g, '\n').replace(/\u200B/g, '').trimEnd();
}

function coerceLooseHeadingSyntax(markdown) {
  return markdown.replace(/^(\s{0,3}#{1,6})([^\s#].*)$/gm, '$1 $2');
}

function getImageAltText(fileName) {
  return pathLikeStem(fileName || 'image');
}

function pathLikeStem(fileName) {
  return String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim() || 'image';
}

function inferImageFileName(file) {
  const rawName = String(file?.name || '').trim();
  if (/\.[a-z0-9]+$/i.test(rawName)) {
    return rawName;
  }

  const byType = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
    'image/avif': '.avif',
  };

  const normalizedType = String(file?.type || '').toLowerCase();
  const ext = byType[normalizedType] || '.png';
  return `image${ext}`;
}

function slugifyHeading(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-') || 'section';
}

function focusSearchInput() {
  if (workspace.classList.contains('sidebar-hidden')) {
    toggleSidebar();
  }

  if (!searchInput) {
    return;
  }

  searchInput.focus();
  searchInput.select();
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyScore(query, candidate) {
  if (!query) {
    return 1;
  }

  if (!candidate) {
    return -1;
  }

  if (candidate === query) {
    return 240;
  }

  if (candidate.startsWith(query)) {
    return 200 - Math.min(40, candidate.length - query.length);
  }

  const containsIndex = candidate.indexOf(query);
  if (containsIndex >= 0) {
    return 150 - Math.min(50, containsIndex);
  }

  let queryIndex = 0;
  let sequenceBonus = 0;
  let previousMatch = -2;

  for (let candidateIndex = 0; candidateIndex < candidate.length && queryIndex < query.length; candidateIndex += 1) {
    if (candidate[candidateIndex] !== query[queryIndex]) {
      continue;
    }

    if (candidateIndex === previousMatch + 1) {
      sequenceBonus += 6;
    } else {
      sequenceBonus += 2;
    }
    previousMatch = candidateIndex;
    queryIndex += 1;
  }

  if (queryIndex === query.length) {
    return 55 + sequenceBonus;
  }

  return -1;
}

function flattenWorkspaceFileNodes(treeNode, output = []) {
  if (!treeNode) {
    return output;
  }

  for (const child of treeNode.children || []) {
    if (child.type === 'file') {
      output.push(child);
      continue;
    }

    if (child.type === 'directory') {
      flattenWorkspaceFileNodes(child, output);
    }
  }

  return output;
}

function relativeWorkspacePath(filePath) {
  const fullPath = String(filePath || '');
  const rootPath = String(workspaceRootPath || '');
  if (!rootPath) {
    return getFileName(fullPath);
  }

  const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalizedFile = fullPath.replace(/\\/g, '/');

  if (!normalizedFile.startsWith(`${normalizedRoot}/`)) {
    return getFileName(fullPath);
  }

  return normalizedFile.slice(normalizedRoot.length + 1);
}

function makeCommandPaletteActions() {
  return [
    {
      id: 'new-file',
      kind: 'Command',
      title: 'New File',
      subtitle: 'Start a new untitled document',
      keywords: 'create untitled',
      run: () => doNewFile(),
    },
    {
      id: 'open-file',
      kind: 'Command',
      title: 'Open File',
      subtitle: 'Open an existing markdown document',
      keywords: 'open markdown file',
      run: () => doOpen(),
    },
    {
      id: 'save-file',
      kind: 'Command',
      title: 'Save',
      subtitle: 'Save current document',
      keywords: 'write persist',
      run: () => doSave(),
    },
    {
      id: 'save-file-as',
      kind: 'Command',
      title: 'Save As',
      subtitle: 'Save current document to a new path',
      keywords: 'save copy rename',
      run: () => doSaveAs(),
    },
    {
      id: 'toggle-sidebar',
      kind: 'Command',
      title: 'Toggle Sidebar',
      subtitle: 'Show or hide workspace panel',
      keywords: 'files outline panel',
      run: () => toggleSidebar(),
    },
    {
      id: 'focus-search',
      kind: 'Command',
      title: 'Find in Workspace',
      subtitle: 'Focus sidebar search input',
      keywords: 'search find files',
      run: () => focusSearchInput(),
    },
    {
      id: 'open-workspace',
      kind: 'Command',
      title: 'Open Workspace Folder',
      subtitle: 'Choose a different workspace folder',
      keywords: 'folder project directory',
      run: () => doChooseWorkspaceFolder(),
    },
    {
      id: 'toggle-theme',
      kind: 'Command',
      title: 'Toggle Theme',
      subtitle: 'Switch between light and dark mode',
      keywords: 'appearance light dark',
      run: () => cycleTheme(),
    },
    {
      id: 'check-updates',
      kind: 'Command',
      title: 'Check for Updates',
      subtitle: 'Query GitHub release feed',
      keywords: 'refresh update version',
      run: () => runCheckForUpdates(),
    },
    {
      id: 'insert-h1',
      kind: 'Insert',
      title: 'Insert Heading 1',
      subtitle: '# Heading',
      keywords: 'markdown heading h1',
      run: () => {
        editor.focus();
        insertMarkdownAtCaret('# Heading');
      },
    },
    {
      id: 'insert-h2',
      kind: 'Insert',
      title: 'Insert Heading 2',
      subtitle: '## Heading',
      keywords: 'markdown heading h2',
      run: () => {
        editor.focus();
        insertMarkdownAtCaret('## Heading');
      },
    },
    {
      id: 'insert-bulleted-list',
      kind: 'Insert',
      title: 'Insert Bulleted List',
      subtitle: '- List item',
      keywords: 'unordered list bullet markdown',
      run: () => {
        editor.focus();
        insertMarkdownAtCaret('- List item');
      },
    },
    {
      id: 'insert-numbered-list',
      kind: 'Insert',
      title: 'Insert Numbered List',
      subtitle: '1. List item',
      keywords: 'ordered list markdown',
      run: () => {
        editor.focus();
        insertMarkdownAtCaret('1. List item');
      },
    },
    {
      id: 'insert-checklist',
      kind: 'Insert',
      title: 'Insert Checklist Item',
      subtitle: '- [ ] Todo',
      keywords: 'task checkbox todo markdown',
      run: () => {
        editor.focus();
        insertMarkdownAtCaret('- [ ] Todo');
      },
    },
    {
      id: 'insert-code-fence',
      kind: 'Insert',
      title: 'Insert Code Fence',
      subtitle: '```',
      keywords: 'code block fenced markdown',
      run: () => {
        editor.focus();
        insertMarkdownAtCaret('```text\ncode\n```');
      },
    },
  ];
}

function buildCommandPaletteSourceItems() {
  const items = [...makeCommandPaletteActions()];
  const workspaceFiles = flattenWorkspaceFileNodes(workspaceTreeSnapshot, []);

  for (const fileNode of workspaceFiles) {
    const relativePath = relativeWorkspacePath(fileNode.path);
    items.push({
      id: `file:${fileNode.path}`,
      kind: 'File',
      title: getFileName(fileNode.path),
      subtitle: relativePath,
      keywords: `open file ${relativePath}`,
      run: () => openWorkspaceFileByPath(fileNode.path),
    });
  }

  return items;
}

function rankCommandPaletteItems(query) {
  const normalizedQuery = normalizeSearchText(query);
  const sourceItems = buildCommandPaletteSourceItems();
  const ranked = [];

  for (let index = 0; index < sourceItems.length; index += 1) {
    const item = sourceItems[index];
    const title = normalizeSearchText(item.title);
    const searchable = normalizeSearchText(`${item.title} ${item.subtitle || ''} ${item.keywords || ''}`);
    const score = Math.max(fuzzyScore(normalizedQuery, title), fuzzyScore(normalizedQuery, searchable));
    if (score < 0) {
      continue;
    }

    const kindBoost = item.kind === 'Command' ? 10 : item.kind === 'Insert' ? 8 : 0;
    ranked.push({
      item,
      score: score + kindBoost,
      order: index,
    });
  }

  ranked.sort((a, b) => b.score - a.score || a.order - b.order || a.item.title.localeCompare(b.item.title));
  return ranked.map((entry) => entry.item);
}

function setCommandPaletteSelection(index, ensureVisible = true) {
  if (!commandPaletteItems.length) {
    commandPaletteSelectedIndex = 0;
    return;
  }

  const maxIndex = commandPaletteItems.length - 1;
  commandPaletteSelectedIndex = Math.min(maxIndex, Math.max(0, index));

  if (!commandPaletteResults) {
    return;
  }

  const rows = commandPaletteResults.querySelectorAll('.command-palette-item');
  rows.forEach((row, rowIndex) => {
    row.classList.toggle('is-selected', rowIndex === commandPaletteSelectedIndex);
  });

  if (!ensureVisible) {
    return;
  }

  const selectedRow = rows[commandPaletteSelectedIndex];
  selectedRow?.scrollIntoView({ block: 'nearest' });
}

function renderCommandPaletteResults() {
  if (!commandPaletteResults) {
    return;
  }

  commandPaletteResults.innerHTML = '';

  if (commandPaletteItems.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'command-palette-empty';
    empty.textContent = 'No commands found';
    commandPaletteResults.appendChild(empty);
    return;
  }

  commandPaletteItems.forEach((item, index) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'command-palette-item';
    row.dataset.index = String(index);

    const main = document.createElement('span');
    main.className = 'command-palette-item-main';

    const title = document.createElement('span');
    title.className = 'command-palette-item-title';
    title.textContent = item.title;
    main.appendChild(title);

    if (item.subtitle) {
      const subtitle = document.createElement('span');
      subtitle.className = 'command-palette-item-subtitle';
      subtitle.textContent = item.subtitle;
      main.appendChild(subtitle);
    }

    const kind = document.createElement('span');
    kind.className = 'command-palette-item-kind';
    kind.textContent = item.kind;

    row.append(main, kind);
    row.addEventListener('mouseenter', () => {
      setCommandPaletteSelection(index, false);
    });
    row.addEventListener('click', () => {
      executeCommandPaletteItem(index);
    });

    commandPaletteResults.appendChild(row);
  });

  setCommandPaletteSelection(commandPaletteSelectedIndex);
}

function refreshCommandPalette() {
  const query = commandPaletteInput?.value || '';
  commandPaletteItems = rankCommandPaletteItems(query).slice(0, 80);
  commandPaletteSelectedIndex = 0;
  renderCommandPaletteResults();
}

function closeCommandPalette(restoreFocus = true) {
  if (!commandPaletteOpen) {
    return;
  }

  commandPaletteOpen = false;
  if (commandPalette) {
    commandPalette.hidden = true;
  }

  commandPaletteItems = [];
  commandPaletteSelectedIndex = 0;
  if (commandPaletteInput) {
    commandPaletteInput.value = '';
  }
  if (commandPaletteResults) {
    commandPaletteResults.innerHTML = '';
  }

  if (restoreFocus && commandPaletteRestoredFocus instanceof HTMLElement) {
    commandPaletteRestoredFocus.focus();
  }
  commandPaletteRestoredFocus = null;
}

function openCommandPalette(initialQuery = '') {
  if (!commandPalette || !commandPaletteInput) {
    return;
  }

  commandPaletteRestoredFocus = document.activeElement instanceof HTMLElement ? document.activeElement : editor;
  commandPaletteOpen = true;
  commandPalette.hidden = false;
  commandPaletteInput.value = initialQuery;
  refreshCommandPalette();
  commandPaletteInput.focus();
  commandPaletteInput.setSelectionRange(commandPaletteInput.value.length, commandPaletteInput.value.length);
}

function toggleCommandPalette() {
  if (commandPaletteOpen) {
    closeCommandPalette();
    return;
  }

  openCommandPalette();
}

async function executeCommandPaletteItem(index = commandPaletteSelectedIndex) {
  const item = commandPaletteItems[index];
  if (!item) {
    return;
  }

  closeCommandPalette(false);

  try {
    await item.run();
  } catch (error) {
    showAppStatus(`Command failed: ${error?.message || String(error)}`, 'error', 7000);
  }
}

function showAppStatus(message, tone = 'info', autoClearMs = 5000) {
  if (!appStatus) {
    return;
  }

  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }

  const cleanMessage = String(message || '').trim();
  appStatus.textContent = cleanMessage;
  appStatus.dataset.tone = tone;
  appStatus.hidden = !cleanMessage;

  if (cleanMessage && autoClearMs > 0) {
    statusTimer = setTimeout(() => {
      appStatus.textContent = '';
      appStatus.hidden = true;
      appStatus.dataset.tone = 'info';
      statusTimer = null;
    }, autoClearMs);
  }
}

async function runCheckForUpdates() {
  if (!fileApi?.checkForUpdates) {
    showAppStatus('Update checks are unavailable.', 'error', 7000);
    return;
  }

  try {
    const result = await fileApi.checkForUpdates();
    if (!result) {
      showAppStatus('Unable to check for updates.', 'error', 7000);
      return;
    }

    showAppStatus(result.message, result.ok ? 'info' : 'error', 7000);
  } catch (error) {
    showAppStatus(`Unable to check for updates: ${error?.message || String(error)}`, 'error', 7000);
  }
}

function jumpToNthMatch(query, ordinal = 0) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) {
    return;
  }

  let seen = 0;
  let firstMatchRange = null;
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();

  while (textNode) {
    const source = (textNode.textContent || '').replace(/\u200B/g, '');
    const lower = source.toLowerCase();
    let from = 0;

    while (from <= lower.length) {
      const start = lower.indexOf(normalizedQuery, from);
      if (start === -1) {
        break;
      }

      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, start + normalizedQuery.length);

      if (!firstMatchRange) {
        firstMatchRange = range.cloneRange();
      }

      if (seen === ordinal) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        range.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      seen += 1;
      from = start + Math.max(1, normalizedQuery.length);
    }

    textNode = walker.nextNode();
  }

  if (firstMatchRange) {
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(firstMatchRange);
    firstMatchRange.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

async function openSearchResult(filePath, query, ordinal) {
  if (!fileApi) {
    return;
  }

  await openWorkspaceFileByPath(filePath);

  requestAnimationFrame(() => {
    jumpToNthMatch(query, ordinal);
  });
}

async function openWorkspaceFileByPath(filePath) {
  if (!fileApi || !filePath) {
    return false;
  }

  const result = await fileApi.openWorkspaceFile(filePath);
  if (!result) {
    return false;
  }

  currentFilePath = result.filePath;
  setContent(result.content);
  highlightActiveFile(currentFilePath);
  return true;
}

function renderSearchResults(query, groupedResults) {
  if (!searchResults) {
    return;
  }

  searchResults.innerHTML = '';
  const cleanQuery = String(query || '').trim();

  if (!cleanQuery) {
    return;
  }

  if (!groupedResults || groupedResults.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'search-empty';
    empty.textContent = 'No matches';
    searchResults.appendChild(empty);
    return;
  }

  for (const fileResult of groupedResults) {
    const details = document.createElement('details');
    details.open = groupedResults.length <= 4;
    details.className = 'search-group';

    const summary = document.createElement('summary');
    summary.textContent = `${fileResult.relativePath} (${fileResult.matches.length})`;
    details.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'search-group-list';

    for (const match of fileResult.matches) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'search-result-item';
      item.innerHTML = `<span class="search-result-line">L${match.line}</span><span class="search-result-text">${match.preview}</span>`;
      item.title = `${fileResult.relativePath}:${match.line}`;
      item.addEventListener('click', () => {
        openSearchResult(fileResult.filePath, cleanQuery, match.ordinal);
      });
      list.appendChild(item);
    }

    details.appendChild(list);
    searchResults.appendChild(details);
  }
}

async function runWorkspaceSearch(query) {
  if (!fileApi || !searchInput || !searchResults) {
    return;
  }

  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) {
    searchResults.innerHTML = '';
    return;
  }

  const groupedResults = await fileApi.searchWorkspace(cleanQuery);
  renderSearchResults(cleanQuery, groupedResults);
}

function updateOutline() {
  if (!outlineTree) {
    return;
  }

  const headings = Array.from(editor.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  outlineTree.innerHTML = '';

  if (headings.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'outline-empty';
    empty.textContent = 'No headings yet';
    outlineTree.appendChild(empty);
    return;
  }

  const usedSlugs = new Map();

  for (const heading of headings) {
    const text = (heading.textContent || '').trim();
    if (!text) {
      continue;
    }

    const level = Number.parseInt(heading.tagName.slice(1), 10);
    const baseSlug = slugifyHeading(text);
    const count = (usedSlugs.get(baseSlug) || 0) + 1;
    usedSlugs.set(baseSlug, count);
    const id = count === 1 ? `inkflow-${baseSlug}` : `inkflow-${baseSlug}-${count}`;
    heading.id = id;

    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'outline-item';
    item.dataset.level = String(level);
    item.textContent = text;
    item.title = text;
    item.addEventListener('click', () => {
      const target = document.getElementById(id);
      if (!target) {
        return;
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      placeCaretAtEnd(target);
    });

    outlineTree.appendChild(item);
  }
}

function getMarkdownFromEditor() {
  const html = editor.innerHTML;
  const markdown = turndownService.turndown(html);
  return normalizeMarkdown(markdown);
}

function wireTaskCheckboxes() {
  const checkboxes = editor.querySelectorAll('input[type="checkbox"]');
  for (const checkbox of checkboxes) {
    checkbox.removeAttribute('disabled');
    checkbox.setAttribute('contenteditable', 'false');
    checkbox.onchange = () => {
      updateDirtyState();
    };
  }
}

function renderMarkdownIntoEditor(markdown, keepCaretAtEnd = false) {
  isRendering = true;
  const canonicalMarkdown = coerceLooseHeadingSyntax(markdown || '');
  const html = marked.parse(canonicalMarkdown);
  editor.innerHTML = html || '';
  resolveRelativeImageSources();
  wireEditorImages();
  wireTaskCheckboxes();
  updateOutline();
  clearSelectedImage();
  if (keepCaretAtEnd) {
    placeCaretAtEnd(editor);
  }
  isRendering = false;
}

function insertMarkdownAtCaret(markdownSnippet) {
  const canonicalMarkdown = coerceLooseHeadingSyntax(markdownSnippet || '');
  const html = marked.parse(canonicalMarkdown);
  insertHtmlAtCaret(html);
  resolveRelativeImageSources();
  wireEditorImages();
  wireTaskCheckboxes();
  updateDirtyState();
  updateOutline();
}

function isImageLikeFile(file) {
  if (!file) {
    return false;
  }

  return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(file.name || '');
}

function isMarkdownLikeFile(file) {
  if (!file) {
    return false;
  }

  return /\.(md|markdown|mdown|mkd|txt)$/i.test(file.name || '');
}

function hasFilePayload(dataTransfer) {
  if (!dataTransfer) {
    return false;
  }

  if (Array.from(dataTransfer.files || []).some((file) => isImageLikeFile(file))) {
    return true;
  }

  return Array.from(dataTransfer.items || []).some((item) => item.kind === 'file');
}

function updateFileMeta() {
  const fileName = getFileName(currentFilePath);
  const suffix = isDirty ? ' (unsaved)' : '';
  docName.textContent = fileName;
  fileMeta.textContent = currentFilePath ? `${currentFilePath}${suffix}` : `Untitled${suffix}`;
  document.title = `${fileName}${suffix} - Inkflow`;
  saveButton.classList.toggle('primary', isDirty);
}

function updateDirtyState() {
  const liveMarkdown = getMarkdownFromEditor();
  isDirty = liveMarkdown !== currentMarkdown;
  updateFileMeta();
}

function setContent(markdown) {
  currentMarkdown = normalizeMarkdown(markdown || '');
  renderMarkdownIntoEditor(currentMarkdown, false);
  isDirty = false;
  updateFileMeta();
}

function findCurrentBlockElement() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  const directBlock = element?.closest(BLOCK_SELECTOR);
  if (directBlock && directBlock !== editor) {
    return directBlock;
  }

  // When caret lands on the root editor node, resolve only the block at caret position.
  if (node === editor || element === editor) {
    const container = editor;
    const offset = range.startOffset;
    const atOffset = container.childNodes[offset] || null;
    const beforeOffset = offset > 0 ? container.childNodes[offset - 1] : null;
    const candidate = atOffset || beforeOffset;
    const candidateElement = candidate?.nodeType === Node.TEXT_NODE ? candidate.parentElement : candidate;
    if (candidateElement && candidateElement !== editor && candidateElement.matches?.(BLOCK_SELECTOR)) {
      return candidateElement;
    }

    if (container.childNodes.length === 0 || container.childElementCount === 0) {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = '<br>';
      container.appendChild(paragraph);
      return paragraph;
    }
  }

  return null;
}

function replaceBlockPreservingCaret(block, nextElement) {
  block.replaceWith(nextElement);
  const caretTarget = nextElement.matches('li, p, h1, h2, h3, h4, h5, h6') ? nextElement : nextElement.querySelector('li, p, code') || nextElement;
  placeCaretAtEnd(caretTarget);
}

function getCurrentListItem() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const node = selection.anchorNode;
  const element = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  const listItem = element?.closest?.('li');
  if (!listItem || !editor.contains(listItem)) {
    return null;
  }

  return listItem;
}

function indentListItem(listItem) {
  const list = listItem?.parentElement;
  if (!list || !/^(UL|OL)$/.test(list.tagName)) {
    return false;
  }

  const previousItem = listItem.previousElementSibling;
  if (!(previousItem instanceof HTMLLIElement)) {
    return false;
  }

  let nestedList = Array.from(previousItem.children).find(
    (child) => child instanceof HTMLElement && child.tagName === list.tagName,
  );

  if (!nestedList) {
    nestedList = document.createElement(list.tagName.toLowerCase());
    previousItem.appendChild(nestedList);
  }

  nestedList.appendChild(listItem);
  placeCaretAtEnd(listItem);
  return true;
}

function outdentListItem(listItem) {
  const list = listItem?.parentElement;
  if (!list || !/^(UL|OL)$/.test(list.tagName)) {
    return false;
  }

  const parentListItem = list.parentElement;
  if (!(parentListItem instanceof HTMLLIElement)) {
    return false;
  }

  const outerList = parentListItem.parentElement;
  if (!outerList || !/^(UL|OL)$/.test(outerList.tagName)) {
    return false;
  }

  outerList.insertBefore(listItem, parentListItem.nextElementSibling);
  if (!list.querySelector('li')) {
    list.remove();
  }

  placeCaretAtEnd(listItem);
  return true;
}

function handleListTabIndent(event) {
  const listItem = getCurrentListItem();
  if (!listItem) {
    return false;
  }

  event.preventDefault();
  const handled = event.shiftKey ? outdentListItem(listItem) : indentListItem(listItem);
  if (handled) {
    updateDirtyState();
    updateOutline();
  }
  return true;
}

function applyInlineShortcuts(block) {
  if (!(block instanceof HTMLElement)) {
    return false;
  }

  if (block.closest('pre')) {
    return false;
  }

  const source = (block.textContent || '').replace(/\u200B/g, '');
  if (!source.trim()) {
    return false;
  }

  // Inline markdown patterns that should render in-place while typing.
  const hasInlineMarkdown = /(\[[^\]]+\]\([^)]+\)|!\[[^\]]*\]\([^)]+\)|~~[^~]+~~|`[^`]+`|\*\*[^*\n]+\*\*|(?<!\*)\*[^*\n]+\*(?!\*)|(?<!_)_[^_\n]+_(?!_))/.test(source);
  if (!hasInlineMarkdown) {
    return false;
  }

  const renderedInline = marked.parseInline(source).trim();
  if (!renderedInline) {
    return false;
  }

  block.innerHTML = renderedInline;

  // Keep typing outside formatted spans by inserting a plain-text caret anchor.
  const tailAnchor = document.createTextNode(ZWSP);
  block.appendChild(tailAnchor);
  placeCaretInTextNode(tailAnchor, 1);
  return true;
}

function applyBlockShortcuts() {
  const block = findCurrentBlockElement();
  if (!block) {
    return false;
  }

  const text = (block.textContent || '').replace(/\u200B/g, '').trim();
  if (!text) {
    return false;
  }

  if (block.tagName === 'LI') {
    const inlineTaskMatch = text.match(/^\[( |x|X)\]\s+(.+)$/);
    if (inlineTaskMatch) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = inlineTaskMatch[1].toLowerCase() === 'x';
      checkbox.setAttribute('contenteditable', 'false');
      block.innerHTML = '';
      block.appendChild(checkbox);
      block.appendChild(document.createTextNode(` ${inlineTaskMatch[2]}`));
      wireTaskCheckboxes();
      placeCaretAtEnd(block);
      updateOutline();
      return true;
    }
  }

  const headingMatch = text.match(/^(#{1,6})\s*([^\s#].*)$/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const heading = document.createElement(`h${level}`);
    heading.textContent = headingMatch[2];
    block.replaceWith(heading);
    placeCaretAtEnd(heading);
    updateOutline();
    return true;
  }

  const taskMatch = text.match(/^[-*+]\s+\[( |x|X)\]\s+(.+)$/);
  if (taskMatch) {
    const ul = document.createElement('ul');
    const li = document.createElement('li');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = taskMatch[1].toLowerCase() === 'x';
    checkbox.setAttribute('contenteditable', 'false');
    li.appendChild(checkbox);
    li.appendChild(document.createTextNode(` ${taskMatch[2]}`));
    ul.appendChild(li);
    replaceBlockPreservingCaret(block, ul);
    wireTaskCheckboxes();
    updateOutline();
    return true;
  }

  const unorderedMatch = text.match(/^[-*+]\s+(.+)$/);
  if (unorderedMatch) {
    if (/^\[[ xX]\]/.test(unorderedMatch[1])) {
      return false;
    }
    const ul = document.createElement('ul');
    const li = document.createElement('li');
    li.textContent = unorderedMatch[1];
    ul.appendChild(li);
    replaceBlockPreservingCaret(block, ul);
    updateOutline();
    return true;
  }

  const orderedMatch = text.match(/^(\d+)[.)]\s+(.+)$/);
  if (orderedMatch) {
    const ol = document.createElement('ol');
    const startValue = Number.parseInt(orderedMatch[1], 10);
    if (Number.isFinite(startValue) && startValue > 1) {
      ol.setAttribute('start', String(startValue));
    }
    const li = document.createElement('li');
    li.textContent = orderedMatch[2];
    ol.appendChild(li);
    replaceBlockPreservingCaret(block, ol);
    updateOutline();
    return true;
  }

  const quoteMatch = text.match(/^>\s+(.+)$/);
  if (quoteMatch) {
    const quote = document.createElement('blockquote');
    const p = document.createElement('p');
    p.textContent = quoteMatch[1];
    quote.appendChild(p);
    replaceBlockPreservingCaret(block, quote);
    updateOutline();
    return true;
  }

  const ruleMatch = text.match(/^((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/);
  if (ruleMatch) {
    const fragment = document.createDocumentFragment();
    const hr = document.createElement('hr');
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    fragment.append(hr, p);
    block.replaceWith(fragment);
    placeCaretAtEnd(p);
    updateOutline();
    return true;
  }

  const fenceMatch = text.match(/^```([a-zA-Z0-9_-]+)?$/);
  if (fenceMatch) {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    if (fenceMatch[1]) {
      code.className = `language-${fenceMatch[1]}`;
      code.setAttribute('data-language', fenceMatch[1]);
    }
    pre.appendChild(code);
    replaceBlockPreservingCaret(block, pre);
    updateOutline();
    return true;
  }

  const tableMatch = text.match(/^\|(.+)\|$/);
  if (tableMatch && tableMatch[1].includes('|')) {
    const headers = tableMatch[1].split('|').map((value) => value.trim()).filter(Boolean);
    if (headers.length >= 2) {
      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const tr = document.createElement('tr');
      for (const header of headers) {
        const th = document.createElement('th');
        th.textContent = header;
        tr.appendChild(th);
      }
      thead.appendChild(tr);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      const bodyRow = document.createElement('tr');
      for (let index = 0; index < headers.length; index += 1) {
        const td = document.createElement('td');
        td.innerHTML = '<br>';
        bodyRow.appendChild(td);
      }
      tbody.appendChild(bodyRow);
      table.appendChild(tbody);
      replaceBlockPreservingCaret(block, table);
      updateOutline();
      return true;
    }
  }

  if (applyInlineShortcuts(block)) {
    updateOutline();
    return true;
  }

  return false;
}

async function doOpen() {
  if (!fileApi) {
    return;
  }

  const result = await fileApi.openFile();
  if (!result) {
    return;
  }

  currentFilePath = result.filePath;
  setContent(result.content);
  highlightActiveFile(currentFilePath);
}

async function openMarkdownDropFile(file) {
  if (!file) {
    return;
  }

  const sourcePath = typeof file.path === 'string' ? file.path : '';
  if (sourcePath && fileApi?.openFilePath) {
    const result = await fileApi.openFilePath(sourcePath);
    if (result) {
      currentFilePath = result.filePath || sourcePath;
      setContent(result.content || '');
      highlightActiveFile(currentFilePath);
      showAppStatus(`Opened ${getFileName(currentFilePath)}`, 'success', 3000);
      return;
    }
  }

  const fallbackText = await file.text();
  currentFilePath = '';
  setContent(fallbackText || '');
  highlightActiveFile('');
  showAppStatus('Opened dropped file in temporary mode (save to persist path).', 'info', 5000);
}

async function importImageFileToEditor(imageFile) {
  const sourcePath = typeof imageFile.path === 'string' ? imageFile.path : '';
  let imported = null;

  if (sourcePath && fileApi?.importWorkspaceImage) {
    imported = await fileApi.importWorkspaceImage(sourcePath, currentFilePath);
  }

  if (!imported && fileApi?.importWorkspaceImageData) {
    const bytes = Array.from(new Uint8Array(await imageFile.arrayBuffer()));
    const fileName = inferImageFileName(imageFile);
    imported = await fileApi.importWorkspaceImageData(bytes, fileName, currentFilePath);
  }

  if (!imported?.markdownPath) {
    return false;
  }

  insertImportedImage(imported);
  return true;
}

async function doNewFile() {
  currentFilePath = '';
  setContent('');
  highlightActiveFile('');
  placeCaretAtEnd(editor);
}

async function doSave() {
  if (!fileApi) {
    return;
  }

  const markdown = getMarkdownFromEditor();

  if (!currentFilePath) {
    await doSaveAs();
    return;
  }

  const result = await fileApi.saveFile(currentFilePath, markdown);
  if (!result?.filePath) {
    return;
  }

  currentFilePath = result.filePath;
  currentMarkdown = markdown;
  isDirty = false;
  updateFileMeta();
  highlightActiveFile(currentFilePath);
  showAppStatus(`Saved to ${currentFilePath}`, 'success', 3200);
}

async function doSaveAs() {
  if (!fileApi) {
    return;
  }

  const markdown = getMarkdownFromEditor();
  const result = await fileApi.saveFileAs(markdown, currentFilePath || 'untitled.md');
  if (!result?.filePath) {
    return;
  }

  currentFilePath = result.filePath;
  currentMarkdown = markdown;
  isDirty = false;
  updateFileMeta();
  highlightActiveFile(currentFilePath);
  showAppStatus(`Saved to ${currentFilePath}`, 'success', 3200);
}

function toggleSidebar() {
  workspace.classList.toggle('sidebar-hidden');
  syncSidebarButtonState();
}

function syncSidebarButtonState() {
  const hidden = workspace.classList.contains('sidebar-hidden');
  sidebarButton.setAttribute('aria-pressed', String(!hidden));
  sidebarButton.setAttribute('title', hidden ? 'Show file sidebar (Cmd/Ctrl+Shift+B)' : 'Hide file sidebar (Cmd/Ctrl+Shift+B)');
}

function applyTheme() {
  document.body.setAttribute('data-theme', themeMode);
  themeButton.innerHTML = themeMode === 'dark' ? MOON_ICON : SUN_ICON;
  themeButton.setAttribute('aria-label', themeMode === 'dark' ? 'Theme: Dark' : 'Theme: Light');
  themeButton.setAttribute('title', `${themeMode === 'dark' ? 'Theme: Dark' : 'Theme: Light'} (Cmd/Ctrl+Shift+L)`);
}

function cycleTheme() {
  themeMode = themeMode === 'dark' ? 'light' : 'dark';

  localStorage.setItem('inkflow-theme', themeMode);
  applyTheme();
}

function createFileNode(node) {
  if (node.type === 'file') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tree-file';
    button.textContent = node.name;
    button.dataset.filePath = node.path;
    button.addEventListener('click', async () => {
      await openWorkspaceFileByPath(node.path);
    });
    return button;
  }

  const details = document.createElement('details');
  details.open = true;

  const summary = document.createElement('summary');
  summary.textContent = node.name;
  details.appendChild(summary);

  const children = document.createElement('div');
  children.className = 'tree-children';

  for (const child of node.children || []) {
    children.appendChild(createFileNode(child));
  }

  details.appendChild(children);
  return details;
}

function highlightActiveFile(filePath) {
  const files = fileTree.querySelectorAll('.tree-file');
  for (const file of files) {
    file.classList.toggle('active', file.dataset.filePath === filePath);
  }
}

function applyWorkspaceTree(tree) {
  workspaceTreeSnapshot = tree || null;
  workspaceRootPath = tree?.path || '';
  workspaceMeta.textContent = tree?.path || '';
  fileTree.innerHTML = '';

  for (const child of tree?.children || []) {
    fileTree.appendChild(createFileNode(child));
  }

  if (commandPaletteOpen) {
    refreshCommandPalette();
  }
}

async function loadWorkspaceTree() {
  if (!fileApi) {
    return;
  }

  const tree = await fileApi.getWorkspaceTree();
  if (!tree) {
    return;
  }

  applyWorkspaceTree(tree);
}

async function doChooseWorkspaceFolder() {
  if (!fileApi?.chooseWorkspaceFolder) {
    return;
  }

  const tree = await fileApi.chooseWorkspaceFolder();
  if (!tree) {
    return;
  }

  applyWorkspaceTree(tree);
  highlightActiveFile(currentFilePath);
  if (searchInput) {
    searchInput.value = '';
  }
  if (searchResults) {
    searchResults.innerHTML = '';
  }
  showAppStatus(`Workspace: ${tree.path}`, 'success', 4000);
}

editor.addEventListener('input', () => {
  if (selectedImage && !imageResizeState) {
    clearSelectedImage();
  }

  if (isRendering) {
    return;
  }

  applyBlockShortcuts();
  updateDirtyState();
  updateOutline();
});

editor.addEventListener('paste', async (event) => {
  const clipboardItems = Array.from(event.clipboardData?.items || []);
  const clipboardImages = clipboardItems
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(Boolean);

  if (clipboardImages.length > 0) {
    event.preventDefault();
    editor.focus();
    for (const imageFile of clipboardImages) {
      try {
        await importImageFileToEditor(imageFile);
      } catch (error) {
        console.error('Failed to import pasted image:', error);
      }
    }
    return;
  }

  const pastedText = event.clipboardData?.getData('text/plain') || '';
  if (!pastedText) {
    return;
  }

  event.preventDefault();
  const canonicalMarkdown = coerceLooseHeadingSyntax(pastedText);
  const parsedHtml = marked.parse(canonicalMarkdown);
  insertHtmlAtCaret(parsedHtml);
  wireTaskCheckboxes();
  updateDirtyState();
  updateOutline();
});

editorPanel?.addEventListener('dragover', (event) => {
  if (!hasFilePayload(event.dataTransfer)) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  editorPanel?.classList.add('drop-active');
});

editorPanel?.addEventListener('dragleave', (event) => {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    editorPanel?.classList.remove('drop-active');
  }
});

editorPanel?.addEventListener('drop', async (event) => {
  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length > 0) {
    event.preventDefault();
  }
  const imageFiles = files.filter((file) => isImageLikeFile(file));
  if (imageFiles.length === 0) {
    editorPanel?.classList.remove('drop-active');
    return;
  }

  editorPanel?.classList.remove('drop-active');
  editor.focus();

  for (const imageFile of imageFiles) {
    try {
      await importImageFileToEditor(imageFile);
    } catch (error) {
      // Ignore a failed import for one file and continue with other drops.
      console.error('Failed to import dropped image:', error);
    }
  }
});

window.addEventListener('dragover', (event) => {
  if (!hasFilePayload(event.dataTransfer)) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});

window.addEventListener('drop', async (event) => {
  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length === 0) {
    return;
  }

  event.preventDefault();
  editorPanel?.classList.remove('drop-active');

  const targetInsideEditor = event.target instanceof Element && Boolean(event.target.closest('.editor-panel'));
  const hasImage = files.some((file) => isImageLikeFile(file));
  if (targetInsideEditor && hasImage) {
    return;
  }

  const markdownFile = files.find((file) => isMarkdownLikeFile(file));
  if (!markdownFile) {
    return;
  }

  try {
    await openMarkdownDropFile(markdownFile);
  } catch (error) {
    showAppStatus(`Failed to open dropped file: ${error?.message || String(error)}`, 'error', 7000);
  }
});

editor.addEventListener('click', (event) => {
  const target = event.target;
  if (isEditorImage(target)) {
    selectEditorImage(target);
    return;
  }

  if (!isInsideImageToolsTarget(target)) {
    clearSelectedImage();
  }
});

imageAltInput?.addEventListener('input', () => {
  if (!isEditorImage(selectedImage)) {
    return;
  }

  selectedImage.setAttribute('alt', imageAltInput.value || '');
  updateDirtyState();
});

imageWidthResetButton?.addEventListener('click', () => {
  if (!isEditorImage(selectedImage)) {
    return;
  }

  selectedImage.style.removeProperty('width');
  selectedImage.removeAttribute('width');
  selectedImage.style.maxWidth = '100%';
  updateImageToolsPosition();
  updateDirtyState();
});

imageResizeHandle?.addEventListener('mousedown', (event) => {
  startImageResize(event);
});

window.addEventListener('mousemove', (event) => {
  if (!imageResizeState || !isEditorImage(selectedImage)) {
    return;
  }

  const deltaX = event.clientX - imageResizeState.startX;
  setSelectedImageWidth(imageResizeState.startWidth + deltaX);
});

window.addEventListener('mouseup', () => {
  imageResizeState = null;
});

window.addEventListener('mousedown', (event) => {
  if (!selectedImage) {
    return;
  }

  if (!isEditorImage(selectedImage)) {
    clearSelectedImage();
    return;
  }

  if (shouldKeepImageToolsOpen(event.target)) {
    return;
  }

  clearSelectedImage();
});

window.addEventListener('resize', () => {
  updateImageToolsPosition();
});

editorPanel?.addEventListener('scroll', () => {
  updateImageToolsPosition();
});

commandPaletteBackdrop?.addEventListener('click', () => {
  closeCommandPalette();
});

commandPaletteInput?.addEventListener('input', () => {
  refreshCommandPalette();
});

window.addEventListener('keydown', (event) => {
  if (event.isComposing) {
    return;
  }

  const commandShortcut = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k';
  if (commandShortcut) {
    event.preventDefault();
    toggleCommandPalette();
    return;
  }

  if (!commandPaletteOpen) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeCommandPalette();
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    setCommandPaletteSelection(commandPaletteSelectedIndex + 1);
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    setCommandPaletteSelection(commandPaletteSelectedIndex - 1);
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    executeCommandPaletteItem();
  }
}, true);

editor.addEventListener('keydown', (event) => {
  if (commandPaletteOpen) {
    return;
  }

  if (event.key === 'Tab' && handleListTabIndent(event)) {
    return;
  }

  if (event.key === 'Escape' && selectedImage) {
    event.preventDefault();
    clearSelectedImage();
    return;
  }

  const isTypingKey = event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete' || event.key === 'Enter';
  if (selectedImage && isTypingKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
    clearSelectedImage();
  }

  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'b') {
    event.preventDefault();
    toggleSidebar();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'n') {
    event.preventDefault();
    doNewFile();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'l') {
    event.preventDefault();
    cycleTheme();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    focusSearchInput();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'u') {
    event.preventDefault();
    runCheckForUpdates();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    doChooseWorkspaceFolder();
  }
});

editor.addEventListener('focusout', (event) => {
  if (!selectedImage) {
    return;
  }

  const nextTarget = event.relatedTarget;
  if (nextTarget instanceof Element && nextTarget.closest('#image-tools')) {
    return;
  }

  clearSelectedImage();
});

window.addEventListener('pointerdown', (event) => {
  if (!selectedImage) {
    return;
  }

  if (!isEditorImage(selectedImage)) {
    clearSelectedImage();
    return;
  }

  if (shouldKeepImageToolsOpen(event.target)) {
    return;
  }

  clearSelectedImage();
}, true);

window.addEventListener('keydown', (event) => {
  if (!selectedImage) {
    return;
  }

  if (!isEditorImage(selectedImage)) {
    clearSelectedImage();
    return;
  }

  if (isInsideImageToolsTarget(event.target)) {
    return;
  }

  const printable = event.key.length === 1;
  const editorMutationKey = printable || event.key === 'Backspace' || event.key === 'Delete' || event.key === 'Enter' || event.key === 'Escape';
  if (!editorMutationKey) {
    return;
  }

  if (event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  clearSelectedImage();
}, true);

searchInput?.addEventListener('input', (event) => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }

  const query = event.target.value;
  searchDebounceTimer = setTimeout(() => {
    runWorkspaceSearch(query);
  }, 140);
});

sidebarButton.addEventListener('click', toggleSidebar);
workspaceFolderButton?.addEventListener('click', doChooseWorkspaceFolder);
updateButton?.addEventListener('click', runCheckForUpdates);
themeButton.addEventListener('click', cycleTheme);
newButton.addEventListener('click', doNewFile);
openButton.addEventListener('click', doOpen);
saveButton.addEventListener('click', doSave);
saveAsButton.addEventListener('click', doSaveAs);

if (!fileApi) {
  fileMeta.textContent = 'Bridge unavailable. Restart app.';
  sidebarButton.disabled = true;
  if (workspaceFolderButton) {
    workspaceFolderButton.disabled = true;
  }
  if (updateButton) {
    updateButton.disabled = true;
  }
  themeButton.disabled = true;
  newButton.disabled = true;
  openButton.disabled = true;
  saveButton.disabled = true;
  saveAsButton.disabled = true;
} else {
  fileApi.onNewFileFromMenu(() => {
    doNewFile();
  });

  fileApi.onOpenFileFromMenu((payload) => {
    if (!payload) {
      return;
    }

    currentFilePath = payload.filePath;
    setContent(payload.content);
    highlightActiveFile(currentFilePath);
  });

  fileApi.onSaveFileFromMenu(() => {
    doSave();
  });

  fileApi.onSaveAsFromMenu(() => {
    doSaveAs();
  });

  fileApi.onToggleSidebarFromMenu(() => {
    toggleSidebar();
  });

  fileApi.onOpenWorkspaceFromMenu(() => {
    doChooseWorkspaceFolder();
  });

  fileApi.onFocusSearchFromMenu(() => {
    focusSearchInput();
  });

  fileApi.onOpenCommandPaletteFromMenu(() => {
    openCommandPalette();
  });

  fileApi.onUpdateStatus((payload) => {
    const type = payload?.type || 'info';
    const message = payload?.message || '';
    const tone = type === 'error' ? 'error' : type === 'up-to-date' ? 'success' : 'info';
    showAppStatus(message, tone, type === 'downloading' ? 0 : 7000);
  });
}

window.addEventListener('beforeunload', (event) => {
  if (allowWindowUnload || !isDirty) {
    return;
  }

  const shouldClose = window.confirm('You have unsaved changes. Quit without saving?');
  if (shouldClose) {
    allowWindowUnload = true;
    return;
  }

  event.preventDefault();
  event.returnValue = false;
});

setContent('# Welcome to Inkflow\n\nStart writing markdown here.');
loadWorkspaceTree();

const savedTheme = localStorage.getItem('inkflow-theme') || localStorage.getItem('typoralite-theme');
if (savedTheme === 'dark' || savedTheme === 'light') {
  themeMode = savedTheme;
} else {
  themeMode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
applyTheme();
syncSidebarButtonState();
