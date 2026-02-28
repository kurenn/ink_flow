import { marked } from '../../node_modules/marked/lib/marked.esm.js';
import TurndownService from '../../node_modules/turndown/lib/turndown.es.js';

const editor = document.getElementById('editor-surface');
const docName = document.getElementById('doc-name');
const fileMeta = document.getElementById('file-meta');
const workspace = document.getElementById('workspace');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const fileTree = document.getElementById('file-tree');
const outlineTree = document.getElementById('outline-tree');
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

turndownService.addRule('task-checkbox', {
  filter: (node) => node.nodeName === 'INPUT' && node.getAttribute('type') === 'checkbox',
  replacement: (_, node) => (node.checked ? '[x] ' : '[ ] '),
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
const ZWSP = '\u200B';
const BLOCK_SELECTOR = 'p, div, li, h1, h2, h3, h4, h5, h6, blockquote';
const SUN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/><circle cx="12" cy="12" r="4"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

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

function normalizeMarkdown(markdown) {
  return (markdown || '').replace(/\r\n/g, '\n').replace(/\u200B/g, '').trimEnd();
}

function coerceLooseHeadingSyntax(markdown) {
  return markdown.replace(/^(\s{0,3}#{1,6})([^\s#].*)$/gm, '$1 $2');
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

  const result = await fileApi.openWorkspaceFile(filePath);
  if (!result) {
    return;
  }

  currentFilePath = result.filePath;
  setContent(result.content);
  highlightActiveFile(currentFilePath);

  requestAnimationFrame(() => {
    jumpToNthMatch(query, ordinal);
  });
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
  wireTaskCheckboxes();
  updateOutline();
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
  updateOutline();
});

editor.addEventListener('paste', (event) => {
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
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    focusSearchInput();
  }
});

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

  fileApi.onFocusSearchFromMenu(() => {
    focusSearchInput();
  });
}

window.addEventListener('beforeunload', (event) => {
  if (!isDirty) {
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
