# TyporaLite

A simple and clean desktop Markdown editor for macOS and Linux.

## Features

- Fast Markdown editing with instant preview
- Open, Save, and Save As support
- Clean split-layout interface
- Preview panel toggle (`Cmd/Ctrl + \\`)
- Keyboard shortcuts:
  - `Cmd/Ctrl + O` open
  - `Cmd/Ctrl + S` save
  - `Cmd/Ctrl + Shift + S` save as

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
