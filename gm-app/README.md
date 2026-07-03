# Roselake GM App

A desktop GM companion for the **Roselake** Call of Cthulhu campaign (Nebraska, 1981).

---

## Getting the app (no Node/npm required)

Every push to `main` that touches `gm-app/` automatically builds a portable Windows `.exe` via GitHub Actions:

1. On GitHub, open this repo → **Actions** tab → **Build GM App (.exe)** workflow.
2. Click the most recent successful run (or trigger one yourself with **Run workflow**).
3. Download the **roselake-gm-windows** artifact and unzip it — inside is `Roselake GM x.x.x.exe`.
4. Put the `.exe` anywhere you like (your Desktop is fine) and double-click it.

### First launch

The app will ask you to pick your **vault folder** — the folder on your PC containing your notes
(`Master Timeline.md`, `Maps/`, etc., i.e. a checkout of this repo). It remembers your choice, so
every future launch just opens straight up. If you ever move the vault folder, use
**Vault → Change Vault Folder…** in the app's menu bar to pick it again.

The app reads your notes live from that folder and reloads automatically whenever you edit a
note in Obsidian (or any editor) — nothing is baked into the `.exe` itself, so the app always
reflects the current state of your notes.

---

## Running from source (for development)

### Prerequisites

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
- **Interactive hotspots** — on any map, click **Edit Hotspots**, drag a rectangle over a location, name it, and optionally link it to a note. Hotspots are saved alongside the rest of the app's state (see below).
- **Rendered notes** — every `.md` file in your vault folder is listed in the sidebar, categorised into Cases, Characters, Locations, Handouts, Sessions, and Lore. Click any note to read it with full Markdown rendering. `[[Wikilinks]]` are clickable.
- **Side panel** — clicking a map hotspot linked to a note slides it open without losing your map view.
- **Campaign Tracker** — per-session state:
  - **Characters** — status (Unknown / Met / Ally / Suspicious / Dead) + notes per NPC
  - **Cases** — status (Unknown / Active / Investigating / Solved / Cold) + notes
  - **Handouts** — Ready / Revealed toggles per handout file
  - **GM Notes** — free-text scratch pad per session
- **Live reload** — editing a note in Obsidian (or any editor) automatically refreshes the sidebar and reloads the open note.
- **Vault picker** — pick your vault folder once on first launch; change it any time via **Vault → Change Vault Folder…**.

App state (campaign tracker, hotspots, ingest settings) is stored per-user, outside the vault and outside the app itself:
- Windows: `%APPDATA%\Roselake GM\state\`
- macOS: `~/Library/Application Support/Roselake GM/state/`
- Linux: `~/.config/Roselake GM/state/`

This keeps your saved progress intact even if you replace the `.exe` with a newer build, and keeps it separate from the notes vault (which stays plain Markdown files under git).

---

## Building a standalone `.exe` yourself (optional)

The GitHub Actions workflow (see above) does this for you automatically. To build locally instead:

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
