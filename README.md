# Sudoku

A Sudoku game you can install and play offline, as a progressive web app (PWA). It is written in plain HTML, CSS and JavaScript, with no build step or dependencies. nginx serves it from a Docker container.

## Features

- Puzzles are generated in the browser at four difficulty levels (Easy, Medium, Hard, Expert), and every puzzle has exactly one solution
- Pencil-mark notes, which are cleared automatically when you place a number
- Undo, erase and hints
- The row, column and box of the selected cell are highlighted, along with every cell holding the same number
- Wrong entries are shown in red and counted, and clashing cells are highlighted
- A timer that pauses automatically when the tab is hidden
- Stats for each level: how many puzzles you've solved and your fastest time. Only games solved without hints count towards the fastest time
- Your game is saved in `localStorage`, so you can carry on after closing the app. The app also asks the browser to keep this storage permanently (`navigator.storage.persist()`), so it isn't cleared to free up space
- Light and dark themes follow the system setting
- Works offline through a service worker, and can be installed to the home screen or desktop

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| Arrow keys | Move the selection |
| `1`–`9` | Enter a number (or a note, when notes mode is on) |
| `Backspace` / `Delete` / `0` | Erase |
| `N` | Turn notes mode on or off |
| `H` | Hint |
| `P` / `Space` | Pause |
| `Ctrl/Cmd+Z` | Undo |

## Running locally

Serve the `public/` directory with any static file server, for example:

```sh
python3 -m http.server -d public 8000
```

## GitHub Pages

`.github/workflows/pages.yml` publishes the `public/` folder to GitHub Pages whenever something in it changes on `main`. GitHub Pages is free and serves over HTTPS, so offline play and installing work there.

## Docker

A GitHub Actions workflow (`.github/workflows/docker.yml`) builds the image for `linux/amd64` and `linux/arm64`, and publishes it to the GitHub Container Registry:

- Each push to `main` publishes `latest` and `sha-<commit>`.
- Each `v*` tag (for example `v1.2.0`) also publishes `1.2.0` and `1.2`.
- Pull requests are built but not published.

```sh
docker run -d -p 8080:8080 ghcr.io/iofo/sudoku:latest
```

Or with Compose:

```sh
cp compose.example.yaml compose.yaml
docker compose up -d
```

To build the image yourself instead:

```sh
docker build -t sudoku-pwa .
docker run -d -p 8080:8080 sudoku-pwa
```

The container runs nginx as a non-root user on port 8080, with a health check at `/healthz`.

> **HTTPS is required.** Browsers only allow service workers, and therefore offline play and installing the app, on HTTPS or on `localhost`. For a real deployment, run the container behind a reverse proxy that handles TLS.

## Releasing updates

After changing any file in `public/`, increase `CACHE_VERSION` in `public/sw.js`. Clients then download the new files, and the app shows an "Update available" message.
