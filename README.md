# Inkflow

A simple and clean desktop Markdown editor for macOS and Linux.

## Features

- Typora-like single-pane live markdown rendering
- New, Open, Save, and Save As support
- Left workspace tree for markdown files
- Workspace folder picker with persisted path
- Live outline panel for document headings
- Workspace search with result navigation
- Drag-and-drop image import (auto-copies into `assets/` and inserts markdown image links)
- Paste images from clipboard directly into the editor
- Click image to edit alt text and drag the resize handle to adjust width
- In-app update check (`Cmd/Ctrl + Shift + U`)
- Sidebar toggle (`Cmd/Ctrl + Shift + B`)
- Light/Dark theme toggle (`Cmd/Ctrl + Shift + L`)
- Live block shortcuts:
  - headings (`#`, `##`, including `#Title`)
  - unordered lists (`*`, `-`, `+`)
  - list nesting with `Tab` (indent) and `Shift+Tab` (outdent)
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
  - `Cmd/Ctrl + Shift + O` open workspace folder
  - `Cmd/Ctrl + S` save
  - `Cmd/Ctrl + Shift + S` save as
  - `Cmd/Ctrl + Shift + B` toggle file sidebar
  - `Cmd/Ctrl + Shift + L` toggle light/dark theme
  - `Cmd/Ctrl + Shift + F` focus workspace search
  - `Cmd/Ctrl + Shift + U` check for updates

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

### macOS universal (.dmg + .zip)

```bash
npm run dist:mac
```

### Linux multi-arch (.AppImage + .deb for x64 + arm64)

```bash
npm run dist:linux
```

### Full release build

```bash
npm run dist:release
```

Built artifacts are generated in `dist/`.

## Workspace behavior

- Development mode defaults to the current working directory.
- Packaged app defaults to `~/Documents/Inkflow`.
- The selected workspace folder is persisted in app settings and restored on next launch.

## In-app update feed

Inkflow checks for updates in packaged builds (startup + `Cmd/Ctrl + Shift + U`).

### Current GitHub feed

This project is configured for:

- Owner: `kurenn`
- Repo: `ink_flow`

If `repository.url` remains `https://github.com/kurenn/ink_flow.git`, no extra env vars are required for GitHub-based update checks.

### Release files required for mac updates

For each version, publish these files to the GitHub Release:

1. `Inkflow-<version>-mac-universal.zip`
2. `latest-mac.yml`

Recommended to also upload:

- `Inkflow-<version>-mac-universal.dmg`

### Build + tag + publish flow

1. Bump version in `package.json` (and lockfile)
2. Build: `npm run dist:mac`
3. Create and push tag: `v<version>`
4. Create GitHub Release for that tag
5. Upload the artifacts listed above

### Feed override options (optional)

Resolution order:

1. `INKFLOW_UPDATE_URL` (generic provider)
2. `INKFLOW_UPDATE_OWNER` + `INKFLOW_UPDATE_REPO` (GitHub provider)
3. `repository.url` in `package.json` (GitHub fallback)
