import { marked } from '../../node_modules/marked/lib/marked.esm.js';
import TurndownService from '../../node_modules/turndown/lib/turndown.es.js';

const editor = document.getElementById('editor-surface');
const docName = document.getElementById('doc-name');
const fileMeta = document.getElementById('file-meta');
const workspace = document.getElementById('workspace');
const fileTree = document.getElementById('file-tree');
const workspaceMeta = document.getElementById('workspace-meta');
const sidebarButton = document.getElementById('sidebar-btn');
const themeButton = document.getElementById('theme-btn');
const newButton = document.getElementById('new-btn');
const openButton = document.getElementById('open-btn');
const saveButton = document.getElementById('save-btn');
const saveAsButton = document.getElementById('save-as-btn');
const fileApi = window.fileApi;

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

marked.setOptions({
  gfm: true,
  breaks: true,
});

let currentFilePath = '';
let currentMarkdown = '';
let isDirty = false;
let isRendering = false;
let themeMode = 'system';

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

function normalizeMarkdown(markdown) {
  return (markdown || '').replace(/\r\n/g, '\n').trimEnd();
}

function coerceLooseHeadingSyntax(markdown) {
  return markdown.replace(/^(\s{0,3}#{1,6})([^\s#].*)$/gm, '$1 $2');
}

function getMarkdownFromEditor() {
  const html = editor.innerHTML;
  const markdown = turndownService.turndown(html);
  return normalizeMarkdown(markdown);
}

function renderMarkdownIntoEditor(markdown, keepCaretAtEnd = false) {
  isRendering = true;
  const canonicalMarkdown = coerceLooseHeadingSyntax(markdown || '');
  const html = marked.parse(canonicalMarkdown);
  editor.innerHTML = html || '';
  if (keepCaretAtEnd) {
    placeCaretAtEnd(editor);
  }
  isRendering = false;
}

function updateFileMeta() {
  const fileName = getFileName(currentFilePath);
  const suffix = isDirty ? ' (unsaved)' : '';
  docName.textContent = fileName;
  fileMeta.textContent = currentFilePath ? `${currentFilePath}${suffix}` : `Untitled${suffix}`;
  document.title = `${fileName}${suffix} - TyporaLite`;
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

  const node = selection.getRangeAt(0).startContainer;
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  return element?.closest('p, div, h1, h2, h3, h4, h5, h6');
}

function applyBlockShortcuts() {
  const block = findCurrentBlockElement();
  if (!block) {
    return false;
  }

  const text = (block.textContent || '').trim();
  if (!text) {
    return false;
  }

  const headingMatch = text.match(/^(#{1,6})\s*(\S.*)$/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const heading = document.createElement(`h${level}`);
    heading.textContent = headingMatch[2];
    block.replaceWith(heading);
    placeCaretAtEnd(heading);
    return true;
  }

  const unorderedMatch = text.match(/^[-*+]\s+(.+)$/);
  if (unorderedMatch) {
    const ul = document.createElement('ul');
    const li = document.createElement('li');
    li.textContent = unorderedMatch[1];
    ul.appendChild(li);
    block.replaceWith(ul);
    placeCaretAtEnd(li);
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
    block.replaceWith(ol);
    placeCaretAtEnd(li);
    return true;
  }

  const quoteMatch = text.match(/^>\s+(.+)$/);
  if (quoteMatch) {
    const quote = document.createElement('blockquote');
    const p = document.createElement('p');
    p.textContent = quoteMatch[1];
    quote.appendChild(p);
    block.replaceWith(quote);
    placeCaretAtEnd(p);
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

async function doNewFile() {
  if (!fileApi) {
    return;
  }

  const result = await fileApi.createWorkspaceFile('untitled.md');
  if (!result?.filePath) {
    return;
  }

  currentFilePath = result.filePath;
  setContent(result.content || '');
  await loadWorkspaceTree();
  highlightActiveFile(currentFilePath);
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

  currentMarkdown = markdown;
  isDirty = false;
  updateFileMeta();
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
}

function toggleSidebar() {
  workspace.classList.toggle('sidebar-hidden');
  const hidden = workspace.classList.contains('sidebar-hidden');
  sidebarButton.textContent = hidden ? 'Files' : 'Hide Files';
}

function applyTheme() {
  if (themeMode === 'system') {
    document.body.removeAttribute('data-theme');
    themeButton.textContent = 'Theme: System';
    return;
  }

  document.body.setAttribute('data-theme', themeMode);
  themeButton.textContent = themeMode === 'dark' ? 'Theme: Dark' : 'Theme: Light';
}

function cycleTheme() {
  if (themeMode === 'system') {
    themeMode = 'light';
  } else if (themeMode === 'light') {
    themeMode = 'dark';
  } else {
    themeMode = 'system';
  }

  localStorage.setItem('typoralite-theme', themeMode);
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
      if (!fileApi) {
        return;
      }

      const result = await fileApi.openWorkspaceFile(node.path);
      if (!result) {
        return;
      }

      currentFilePath = result.filePath;
      setContent(result.content);
      highlightActiveFile(currentFilePath);
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

async function loadWorkspaceTree() {
  if (!fileApi) {
    return;
  }

  const tree = await fileApi.getWorkspaceTree();
  if (!tree) {
    return;
  }

  workspaceMeta.textContent = tree.path;
  fileTree.innerHTML = '';

  for (const child of tree.children || []) {
    fileTree.appendChild(createFileNode(child));
  }
}

editor.addEventListener('input', () => {
  if (isRendering) {
    return;
  }

  applyBlockShortcuts();
  updateDirtyState();
});

editor.addEventListener('keydown', (event) => {
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
  }
});

sidebarButton.addEventListener('click', toggleSidebar);
themeButton.addEventListener('click', cycleTheme);
newButton.addEventListener('click', doNewFile);
openButton.addEventListener('click', doOpen);
saveButton.addEventListener('click', doSave);
saveAsButton.addEventListener('click', doSaveAs);

if (!fileApi) {
  fileMeta.textContent = 'Bridge unavailable. Restart app.';
  sidebarButton.disabled = true;
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
}

window.addEventListener('beforeunload', (event) => {
  if (!isDirty) {
    return;
  }

  event.preventDefault();
  event.returnValue = false;
});

setContent('# Welcome to TyporaLite\n\nStart writing markdown here.');
loadWorkspaceTree();

themeMode = localStorage.getItem('typoralite-theme') || 'system';
applyTheme();
sidebarButton.textContent = workspace.classList.contains('sidebar-hidden') ? 'Files' : 'Hide Files';
