# TyporaLite

A simple and clean desktop Markdown editor for macOS and Linux.

## Features

- Typora-like single-pane live markdown rendering
- New, Open, Save, and Save As support
- Left workspace tree for markdown files
- Sidebar toggle (`Cmd/Ctrl + Shift + B`)
- Light/Dark/System theme toggle (`Cmd/Ctrl + Shift + L`)
- Keyboard shortcuts:
  - `Cmd/Ctrl + N` new file
  - `Cmd/Ctrl + O` open
  - `Cmd/Ctrl + S` save
  - `Cmd/Ctrl + Shift + S` save as
  - `Cmd/Ctrl + Shift + B` toggle file sidebar
  - `Cmd/Ctrl + Shift + L` cycle theme

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
