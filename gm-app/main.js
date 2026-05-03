const { app, BrowserWindow, ipcMain, session, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const REPO_ROOT = path.join(__dirname, '..');
const STATE_DIR = path.join(__dirname, 'state');
const STATE_FILE = path.join(STATE_DIR, 'app-state.json');
const HOTSPOTS_FILE = path.join(STATE_DIR, 'hotspots.json');
const MAPS_DIR = path.join(REPO_ROOT, 'Maps');

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0c0c10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Roselake GM — Call of Cthulhu',
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  return win;
}

app.whenReady().then(() => {
  ensureStateDir();

  // Custom protocol: gmapp://maps/<filename>  →  REPO_ROOT/Maps/<filename>
  //                  gmapp://root/<filename>  →  REPO_ROOT/<filename>
  session.defaultSession.protocol.handle('gmapp', async (request) => {
    const url = new URL(request.url);
    const host = url.host;
    const filename = decodeURIComponent(url.pathname.slice(1));
    let filePath;
    if (host === 'maps') {
      filePath = path.join(MAPS_DIR, filename);
    } else {
      filePath = path.join(REPO_ROOT, filename);
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });

  const win = createWindow();
  setupFileWatcher(win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC Handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('list-markdown-files', () => {
  try {
    return fs.readdirSync(REPO_ROOT)
      .filter(f => f.endsWith('.md'))
      .sort();
  } catch { return []; }
});

ipcMain.handle('list-map-files', () => {
  try {
    if (!fs.existsSync(MAPS_DIR)) return [];
    return fs.readdirSync(MAPS_DIR)
      .filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))
      .sort();
  } catch { return []; }
});

ipcMain.handle('read-file', (_, filename) => {
  try {
    const filepath = path.join(REPO_ROOT, filename);
    if (!fs.existsSync(filepath)) return null;
    return fs.readFileSync(filepath, 'utf8');
  } catch { return null; }
});

ipcMain.handle('load-state', () => {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch { return null; }
});

ipcMain.handle('save-state', (_, state) => {
  try {
    ensureStateDir();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    return true;
  } catch { return false; }
});

ipcMain.handle('load-hotspots', () => {
  try {
    if (!fs.existsSync(HOTSPOTS_FILE)) return {};
    return JSON.parse(fs.readFileSync(HOTSPOTS_FILE, 'utf8'));
  } catch { return {}; }
});

ipcMain.handle('save-hotspots', (_, hotspots) => {
  try {
    ensureStateDir();
    fs.writeFileSync(HOTSPOTS_FILE, JSON.stringify(hotspots, null, 2), 'utf8');
    return true;
  } catch { return false; }
});

// ── File Watcher ──────────────────────────────────────────────────────────────

function setupFileWatcher(win) {
  let chokidar;
  try { chokidar = require('chokidar'); } catch {
    console.warn('chokidar not installed — live file-watching disabled. Run npm install to enable.');
    return;
  }

  const watcher = chokidar.watch(REPO_ROOT, {
    ignored: [
      /node_modules/,
      /\.git/,
      /gm-app[\\/]state/,
      /gm-app[\\/]dist/,
      /\.(png|jpg|jpeg|gif|webp)$/i,
    ],
    persistent: true,
    ignoreInitial: true,
    depth: 1,
  });

  const notify = (type, filePath) => {
    if (!win.isDestroyed()) {
      const filename = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
      win.webContents.send('file-changed', { type, filename });
    }
  };

  watcher.on('change', fp => notify('change', fp));
  watcher.on('add', fp => notify('add', fp));
  watcher.on('unlink', fp => notify('remove', fp));
}
