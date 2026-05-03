# Roselake GM App

A desktop GM companion for the **Roselake** Call of Cthulhu campaign.

## Setup (one time)

```bash
cd gm-app
npm install
```

## Run

```bash
npm start
```

## Features

- **All 14 maps** — every location in 8 groups (exterior + interior pairs). Click the map name in the sidebar.
- **Interactive hotspots** — click **Edit Hotspots** on any map, drag a rectangle over a location, name it and link it to a note. Hotspots persist in `state/hotspots.json`.
- **Rendered notes** — every `.md` file in the repo is listed in the sidebar under Cases, Characters, Locations, Handouts, Sessions, and Lore. Click any note to read it. `[[Wikilinks]]` are clickable and navigate between notes.
- **Side panel** — when you click a map hotspot that has a linked note, the note opens in a slide-in side panel so you never lose your map view.
- **Campaign Tracker** — tracks per-session state (stored in `state/app-state.json`, gitignored):
  - **Characters** — Unknown / Met / Ally / Suspicious / Dead + notes per NPC
  - **Cases** — Unknown / Active / Investigating / Solved / Cold + notes per case thread
  - **Handouts** — Ready / Revealed toggles per handout file
  - **GM Notes** — free-text notes per session
- **Live updates** — when you edit a note in Obsidian or add a new file, the sidebar refreshes automatically and any open note reloads.

## Build a standalone `.exe` (optional)

```bash
npm run dist
```

The portable `.exe` will appear in `gm-app/dist/`.

## File layout

```
gm-app/
  main.js          Electron main process
  preload.js       IPC bridge (markdown rendering, file API)
  renderer/
    index.html
    style.css      Dark horror theme
    app.js         All UI logic
  state/           Created at runtime, gitignored
    app-state.json  Campaign tracker state
    hotspots.json   Map hotspot positions
```
