# Roselake GM App

A desktop GM companion for the **Roselake** Call of Cthulhu campaign (Nebraska, 1981).

---

## Prerequisites

- **Node.js** — download from [nodejs.org](https://nodejs.org/) (LTS version recommended). This also installs `npm`.
- **Electron** — installed automatically as part of the setup below.

---

## First-time setup

Open a terminal in this directory (`gm-app/`) and run:

```bash
npm install --omit=dev
```

> **Why `--omit=dev` and not plain `npm install`?**
> Plain `npm install` also installs Electron as a dev dependency, which requires downloading a ~100 MB binary from GitHub. This download frequently fails on restricted networks (corporate VPN, firewalls, proxies). `--omit=dev` installs only the two packages the app actually needs at runtime — `marked` and `chokidar` — and avoids the binary download entirely. Electron is launched separately (see below).

If setup worked, you will see a `node_modules/` folder appear inside `gm-app/`.

### If the screen is blank after launching

The app now shows an error message on screen if setup is incomplete. Follow the instructions it displays. If the app shows nothing at all, open DevTools with **Ctrl+Shift+I** and check the Console tab for errors.

---

## Running the app

You need **Electron** on your PATH to launch the app. Install it globally once:

```bash
npm install -g electron@28
```

Then, from the `gm-app/` directory:

```bash
npm start
```

Alternatively, you can install Electron locally (this downloads the binary):

```bash
npm install --save-dev electron@28
npm start
```

---

## Features

- **All 14 maps** across 8 location groups (exterior + interior pairs). Click a map name in the sidebar.
- **Interactive hotspots** — on any map, click **Edit Hotspots**, drag a rectangle over a location, name it, and optionally link it to a note. Hotspots are saved to `state/hotspots.json`.
- **Rendered notes** — every `.md` file in the repo root is listed in the sidebar, categorised into Cases, Characters, Locations, Handouts, Sessions, and Lore. Click any note to read it with full Markdown rendering. `[[Wikilinks]]` are clickable.
- **Side panel** — clicking a map hotspot linked to a note slides it open without losing your map view.
- **Campaign Tracker** — per-session state stored in `state/app-state.json` (gitignored):
  - **Characters** — status (Unknown / Met / Ally / Suspicious / Dead) + notes per NPC
  - **Cases** — status (Unknown / Active / Investigating / Solved / Cold) + notes
  - **Handouts** — Ready / Revealed toggles per handout file
  - **GM Notes** — free-text scratch pad per session
- **Live reload** — editing a note in Obsidian (or any editor) automatically refreshes the sidebar and reloads the open note.

---

## Building a standalone `.exe` (optional)

To package the app as a portable Windows executable:

```bash
npm install          # full install including dev dependencies
npm run dist
```

The portable `.exe` will appear in `gm-app/dist/`.

---

## File layout

```
gm-app/
  main.js          Electron main process — file I/O, IPC handlers, file watcher
  preload.js       Context bridge — exposes file API and markdown parser to renderer
  renderer/
    index.html     Shell HTML (sidebar + main panel)
    style.css      Dark horror theme
    app.js         All UI logic
  state/           Created at runtime, gitignored
    app-state.json  Campaign tracker state
    hotspots.json   Map hotspot positions
```
