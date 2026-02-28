import { marked } from '../../node_modules/marked/lib/marked.esm.js';

const editor = document.getElementById('markdown-input');
const preview = document.getElementById('markdown-preview');
const fileMeta = document.getElementById('file-meta');
const workspace = document.getElementById('workspace');
const openButton = document.getElementById('open-btn');
const saveButton = document.getElementById('save-btn');
const saveAsButton = document.getElementById('save-as-btn');
const previewButton = document.getElementById('preview-btn');
const fileApi = window.fileApi;

let currentFilePath = '';
let isDirty = false;

marked.setOptions({
  gfm: true,
  breaks: true,
});

function getFileName(filePath) {
  if (!filePath) {
    return 'Untitled';
  }

  return filePath.split(/[\\/]/).pop() || filePath;
}

function updateFileMeta() {
  const fileName = getFileName(currentFilePath);
  const suffix = isDirty ? ' (unsaved)' : '';
  fileMeta.textContent = currentFilePath ? `${fileName}${suffix}` : `Untitled${suffix}`;
  document.title = `${fileName}${suffix} - TyporaLite`;
  saveButton.classList.toggle('primary', isDirty);
}

function renderPreview() {
  preview.innerHTML = marked.parse(editor.value || '');
}

function setContent(content) {
  editor.value = content;
  renderPreview();
  isDirty = false;
  updateFileMeta();
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
}

async function doSave() {
  if (!fileApi) {
    return;
  }

  if (!currentFilePath) {
    await doSaveAs();
    return;
  }

  const result = await fileApi.saveFile(currentFilePath, editor.value);
  if (!result?.filePath) {
    return;
  }

  isDirty = false;
  updateFileMeta();
}

async function doSaveAs() {
  if (!fileApi) {
    return;
  }

  const result = await fileApi.saveFileAs(editor.value, currentFilePath || 'untitled.md');
  if (!result?.filePath) {
    return;
  }

  currentFilePath = result.filePath;
  isDirty = false;
  updateFileMeta();
}

function togglePreview() {
  workspace.classList.toggle('show-preview');
  previewButton.textContent = workspace.classList.contains('show-preview') ? 'Hide Preview' : 'Show Preview';
}

editor.addEventListener('input', () => {
  renderPreview();
  isDirty = true;
  updateFileMeta();
});

openButton.addEventListener('click', doOpen);
saveButton.addEventListener('click', doSave);
saveAsButton.addEventListener('click', doSaveAs);
previewButton.addEventListener('click', togglePreview);

if (!fileApi) {
  fileMeta.textContent = 'Bridge unavailable. Restart app.';
  openButton.disabled = true;
  saveButton.disabled = true;
  saveAsButton.disabled = true;
} else {
  fileApi.onOpenFileFromMenu((payload) => {
    if (!payload) {
      return;
    }

    currentFilePath = payload.filePath;
    setContent(payload.content);
  });

  fileApi.onSaveFileFromMenu(() => {
    doSave();
  });

  fileApi.onSaveAsFromMenu(() => {
    doSaveAs();
  });

  fileApi.onTogglePreviewFromMenu(() => {
    togglePreview();
  });
}

window.addEventListener('beforeunload', (event) => {
  if (!isDirty) {
    return;
  }

  event.preventDefault();
  event.returnValue = false;
});

setContent('# Welcome to TyporaLite\n\nA lightweight markdown editor with instant preview.');
