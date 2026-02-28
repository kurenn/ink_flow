# Inkflow

A simple and clean desktop Markdown editor for macOS and Linux.

## Features

- Typora-like single-pane live markdown rendering
- New, Open, Save, and Save As support
- Left workspace tree for markdown files
- Live outline panel for document headings
- Workspace search with result navigation
- Sidebar toggle (`Cmd/Ctrl + Shift + B`)
- Light/Dark theme toggle (`Cmd/Ctrl + Shift + L`)
- Live block shortcuts:
  - headings (`#`, `##`, including `#Title`)
  - unordered lists (`*`, `-`, `+`)
  - ordered lists (`1.` or `1)`)
  - task lists (`- [ ]`, `- [x]`)
  - blockquotes (`> quote`)
  - horizontal rules (`---`, `***`, `___`)
  - fenced code blocks (```)
- Live inline shortcuts:
  - links (`[text](url)`)
  - images (`![alt](url)`)
  - strikethrough (`~~text~~`)
  - inline code (`` `code` ``)
  - bold/italic (`**bold**`, `_italic_`)
- Table quick-start row (`| col1 | col2 |`)
- Keyboard shortcuts:
  - `Cmd/Ctrl + N` new file
  - `Cmd/Ctrl + O` open
  - `Cmd/Ctrl + S` save
  - `Cmd/Ctrl + Shift + S` save as
  - `Cmd/Ctrl + Shift + B` toggle file sidebar
  - `Cmd/Ctrl + Shift + L` toggle light/dark theme
  - `Cmd/Ctrl + Shift + F` focus workspace search

## Requirements

- Node.js 20+
- npm 10+

## Run locally

```bash
npm install
npm start
```

## Build installers

Build on the target OS for best results.

### macOS (.dmg)

```bash
npm run dist:mac
```

### Linux (.AppImage + .deb)

```bash
npm run dist:linux
```

Built artifacts are generated in `dist/`.
