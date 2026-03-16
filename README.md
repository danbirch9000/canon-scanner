# Scanner Workspace

This project now has a native macOS scanner backend in Node and a small Vue frontend for driving a USB-connected scanner from the browser.

## Why this shape

USB scanner access is handled by the host Mac, where `scanimage` is reliable. The web UI talks to a local Node server instead of trying to reach the scanner hardware directly from the browser or from Docker.

## Project layout

- `scan-doc.sh`: original single-page shell script
- `scan-multipage.sh`: original single- and multi-page shell script
- `server/`: Express API that wraps `scanimage`, ImageMagick, and Ghostscript
- `web/`: Vue frontend built with Vite
- `scripts/setup-mac.sh`: one-command bootstrap for a new Mac
- `Brewfile`: declares required Homebrew packages
- `scans/`: generated output files

## First-time setup on macOS

1. Install [Homebrew](https://brew.sh).
2. Run `./scripts/setup-mac.sh`
3. Plug in the scanner over USB.
4. Run `scanimage -L` and confirm the scanner appears.

## Local development

Start the backend:

```bash
npm run dev --prefix server
```

Start the frontend:

```bash
npm run dev --prefix web
```

The frontend runs on `http://localhost:5173` and proxies API requests to the backend on `http://localhost:3030`.

## Production-ish local run

Build the frontend:

```bash
npm run build --prefix web
```

Start the backend:

```bash
npm run start --prefix server
```

The backend serves the built frontend from `web/dist` and exposes generated scans from `scans/`.

## API summary

- `GET /api/health`
- `GET /api/scanners`
- `GET /api/files`
- `POST /api/scan`
- `POST /api/scan/multipage/start`
- `POST /api/scan/multipage/:sessionId/page`
- `POST /api/scan/multipage/:sessionId/finish`
- `DELETE /api/scan/multipage/:sessionId`
