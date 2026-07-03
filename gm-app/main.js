const { app, BrowserWindow, ipcMain, session, net, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const { pathToFileURL } = require('url');

// The vault (folder of .md notes + Maps/) is user-selected at first launch and
// remembered in userData, since a packaged .exe can live anywhere on disk and
// can no longer assume its own folder sits inside the vault.
let REPO_ROOT = null;
let STATE_DIR, STATE_FILE, HOTSPOTS_FILE, INGEST_SETTINGS_FILE;
const VENV_DIR = path.join(os.homedir(), '.gm-transcription');
const IS_WIN = process.platform === 'win32';
const VENV_PYTHON = IS_WIN
  ? path.join(VENV_DIR, 'Scripts', 'python.exe')
  : path.join(VENV_DIR, 'bin', 'python');
const VENV_WHISPERX = IS_WIN
  ? path.join(VENV_DIR, 'Scripts', 'whisperx.exe')
  : path.join(VENV_DIR, 'bin', 'whisperx');

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

function getMapsDir() {
  return path.join(REPO_ROOT, 'Maps');
}

const VAULT_CONFIG_FILE = () => path.join(app.getPath('userData'), 'vault-config.json');

function loadSavedVaultPath() {
  try {
    const cfg = JSON.parse(fs.readFileSync(VAULT_CONFIG_FILE(), 'utf8'));
    if (cfg.vaultPath && fs.existsSync(cfg.vaultPath)) return cfg.vaultPath;
  } catch { /* no saved config yet */ }
  return null;
}

function saveVaultPath(vaultPath) {
  fs.writeFileSync(VAULT_CONFIG_FILE(), JSON.stringify({ vaultPath }, null, 2), 'utf8');
}

function promptForVaultFolder(defaultPath) {
  const result = dialog.showOpenDialogSync({
    title: 'Select your Obsidian notes vault folder',
    message: 'Choose the folder that contains your campaign notes (e.g. "Master Timeline.md", "Maps/", etc.)',
    defaultPath,
    properties: ['openDirectory'],
    buttonLabel: 'Use this folder',
  });
  return result && result[0] ? result[0] : null;
}

// Determines the vault folder: reuse the saved choice, auto-detect it when
// running unpacked inside the repo during development, or ask the user.
function resolveVaultRoot() {
  const saved = loadSavedVaultPath();
  if (saved) return saved;

  const devGuess = path.join(__dirname, '..');
  if (!app.isPackaged && fs.existsSync(path.join(devGuess, 'Master Timeline.md'))) {
    saveVaultPath(devGuess);
    return devGuess;
  }

  const chosen = promptForVaultFolder(devGuess);
  if (!chosen) return null;
  saveVaultPath(chosen);
  return chosen;
}

// One-time migration for users of the older "state lives inside the repo" layout.
function migrateLegacyState() {
  const legacyDir = path.join(__dirname, 'state');
  if (!fs.existsSync(legacyDir) || legacyDir === STATE_DIR) return;
  ensureStateDir();
  for (const name of ['app-state.json', 'hotspots.json', 'ingest-settings.json']) {
    const src = path.join(legacyDir, name);
    const dest = path.join(STATE_DIR, name);
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      try { fs.copyFileSync(src, dest); } catch { /* best effort */ }
    }
  }
}

function buildAppMenu() {
  const template = [
    {
      label: 'Vault',
      submenu: [
        {
          label: 'Change Vault Folder…',
          click: () => {
            try { fs.unlinkSync(VAULT_CONFIG_FILE()); } catch { /* nothing saved yet */ }
            app.relaunch();
            app.exit(0);
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

let mainWin = null;

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
  mainWin = win;
  return win;
}

app.whenReady().then(() => {
  REPO_ROOT = resolveVaultRoot();
  if (!REPO_ROOT) {
    dialog.showErrorBox(
      'No vault selected',
      'Roselake GM needs your notes vault folder to run. The app will now close — relaunch it to try again.'
    );
    app.quit();
    return;
  }

  const userData = app.getPath('userData');
  STATE_DIR = path.join(userData, 'state');
  STATE_FILE = path.join(STATE_DIR, 'app-state.json');
  HOTSPOTS_FILE = path.join(STATE_DIR, 'hotspots.json');
  INGEST_SETTINGS_FILE = path.join(STATE_DIR, 'ingest-settings.json');

  ensureStateDir();
  migrateLegacyState();
  buildAppMenu();

  // Custom protocol: gmapp://maps/<filename>  →  <vault>/Maps/<filename>
  //                  gmapp://root/<filename>  →  <vault>/<filename>
  session.defaultSession.protocol.handle('gmapp', async (request) => {
    const url = new URL(request.url);
    const host = url.host;
    const filename = decodeURIComponent(url.pathname.slice(1));
    let filePath;
    let baseDir;
    if (host === 'maps') {
      baseDir = path.resolve(getMapsDir());
      filePath = path.resolve(getMapsDir(), filename);
    } else {
      baseDir = path.resolve(REPO_ROOT);
      filePath = path.resolve(REPO_ROOT, filename);
    }

    // Prevent Path Traversal
    if (!filePath.startsWith(baseDir + path.sep) && filePath !== baseDir) {
      return new Response('Access Denied', { status: 403 });
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
    const mapsDir = getMapsDir();
    if (!fs.existsSync(mapsDir)) return [];
    return fs.readdirSync(mapsDir)
      .filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))
      .sort();
  } catch { return []; }
});

ipcMain.handle('read-file', (_, filename) => {
  try {
    const baseDir = path.resolve(REPO_ROOT);
    const filepath = path.resolve(REPO_ROOT, filename);
    if (!filepath.startsWith(baseDir + path.sep) && filepath !== baseDir) return null;

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

// ── Ingest Pipeline IPC ───────────────────────────────────────────────────────

function sendLog(step, text) {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('ingest:log', { step, text });
  }
}

ipcMain.handle('ingest:load-settings', () => {
  try {
    if (!fs.existsSync(INGEST_SETTINGS_FILE)) return {};
    return JSON.parse(fs.readFileSync(INGEST_SETTINGS_FILE, 'utf8'));
  } catch { return {}; }
});

ipcMain.handle('ingest:save-settings', (_, settings) => {
  try {
    ensureStateDir();
    fs.writeFileSync(INGEST_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch { return false; }
});

// Returns { python: bool, ffmpeg: bool, venv: bool, whisperx: bool }
ipcMain.handle('ingest:check-deps', async () => {
  const check = (cmd, args) => new Promise(resolve => {
    const proc = spawn(cmd, args);
    let out = '';
    proc.stdout.on('data', d => { out += d; });
    proc.stderr.on('data', d => { out += d; });
    proc.on('close', code => resolve({ code, out }));
    proc.on('error', () => resolve({ code: -1, out: '' }));
  });

  const py3 = await check('python3', ['--version']);
  const pyFallback = await check('python', ['--version']);
  const python = (py3.code === 0 && py3.out.includes('Python 3')) ||
                 (pyFallback.code === 0 && pyFallback.out.includes('Python 3'));

  const ffmpegRes = await check('ffmpeg', ['-version']);
  const ffmpeg = ffmpegRes.code === 0;

  const venv = fs.existsSync(VENV_DIR);
  const whisperx = fs.existsSync(VENV_WHISPERX);

  return { python, ffmpeg, venv, whisperx };
});

ipcMain.handle('ingest:pick-file', async () => {
  const result = await dialog.showOpenDialog(mainWin, {
    title: 'Select Session Recording',
    properties: ['openFile'],
    filters: [
      { name: 'Video/Audio', extensions: ['mkv', 'mp4', 'avi', 'mov', 'wav'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return result.canceled ? null : result.filePaths[0];
});

// Creates venv and pip-installs whisperx
ipcMain.handle('ingest:setup-venv', async () => {
  const pyCmd = await new Promise(resolve => {
    const p1 = spawn('python3', ['--version']);
    let out = '';
    p1.stdout.on('data', d => { out += d; });
    p1.stderr.on('data', d => { out += d; });
    p1.on('close', code => resolve(code === 0 && out.includes('Python 3') ? 'python3' : 'python'));
    p1.on('error', () => resolve('python'));
  });

  const runStep = (label, cmd, args, opts = {}) => new Promise((resolve, reject) => {
    sendLog('setup', `[${label}] Running: ${cmd} ${args.join(' ')}`);
    const proc = spawn(cmd, args, { ...opts });
    proc.stdout.on('data', d => sendLog('setup', d.toString()));
    proc.stderr.on('data', d => sendLog('setup', d.toString()));
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code}`));
    });
    proc.on('error', err => reject(err));
  });

  try {
    if (!fs.existsSync(VENV_DIR)) {
      await runStep('create venv', pyCmd, ['-m', 'venv', VENV_DIR]);
    }
    const pip = IS_WIN
      ? path.join(VENV_DIR, 'Scripts', 'pip.exe')
      : path.join(VENV_DIR, 'bin', 'pip');
    await runStep('upgrade pip', pip, ['install', '--upgrade', 'pip']);
    await runStep('install whisperx', pip, ['install', 'whisperx']);
    sendLog('setup', '[done] whisperx installed successfully.');
    return { ok: true };
  } catch (err) {
    sendLog('setup', `[error] ${err.message}`);
    return { ok: false, error: err.message };
  }
});

// Runs ffmpeg to produce a .wav beside the source file
ipcMain.handle('ingest:run-ffmpeg', async (_, sourcePath, numTracks) => {
  const dir = path.dirname(sourcePath);
  const base = path.basename(sourcePath, path.extname(sourcePath));
  const wavPath = path.join(dir, base + '.wav');

  const n = parseInt(numTracks, 10) || 1;
  const audioArgs = n > 1
    ? ['-filter_complex', `[0:a]amix=inputs=${n}:duration=longest,dynaudnorm`, '-vn']
    : ['-map', '0:a:0', '-vn'];

  const args = ['-y', '-i', sourcePath, ...audioArgs, wavPath];

  return new Promise(resolve => {
    sendLog('ffmpeg', `Running ffmpeg conversion...`);
    const proc = spawn('ffmpeg', args);
    proc.stdout.on('data', d => sendLog('ffmpeg', d.toString()));
    proc.stderr.on('data', d => sendLog('ffmpeg', d.toString()));
    proc.on('close', code => {
      if (code === 0) {
        sendLog('ffmpeg', `[done] Created: ${wavPath}`);
        resolve({ ok: true, wavPath });
      } else {
        sendLog('ffmpeg', `[error] ffmpeg exited with code ${code}`);
        resolve({ ok: false, error: `ffmpeg exited with code ${code}` });
      }
    });
    proc.on('error', err => {
      sendLog('ffmpeg', `[error] ${err.message}`);
      resolve({ ok: false, error: err.message });
    });
  });
});

// Runs whisperx on a .wav file
ipcMain.handle('ingest:run-whisperx', async (_, wavPath, numSpeakers, hfToken) => {
  const n = parseInt(numSpeakers, 10) || 1;
  const outputDir = path.dirname(wavPath);
  const args = [
    wavPath,
    '--model', 'large-v2',
    '--diarize',
    '--hf_token', hfToken,
    '--min_speakers', String(n),
    '--max_speakers', String(n),
    '--language', 'en',
    '--compute_type', 'int8',
    '--output_dir', outputDir,
  ];

  return new Promise(resolve => {
    sendLog('whisperx', 'Running whisperx transcription (this may take a while)...');
    const proc = spawn(VENV_WHISPERX, args);
    proc.stdout.on('data', d => sendLog('whisperx', d.toString()));
    proc.stderr.on('data', d => sendLog('whisperx', d.toString()));
    proc.on('close', code => {
      if (code === 0) {
        sendLog('whisperx', '[done] Transcription complete.');
        resolve({ ok: true });
      } else {
        sendLog('whisperx', `[error] whisperx exited with code ${code}`);
        resolve({ ok: false, error: `whisperx exited with code ${code}` });
      }
    });
    proc.on('error', err => {
      sendLog('whisperx', `[error] ${err.message}`);
      resolve({ ok: false, error: err.message });
    });
  });
});

// Copies the .txt whisperx output to REPO_ROOT with the user-chosen name
ipcMain.handle('ingest:copy-transcript', (_, wavPath, outputName) => {
  try {
    const dir = path.dirname(wavPath);
    const base = path.basename(wavPath, '.wav');
    const srcTxt = path.join(dir, base + '.txt');

    const baseDir = path.resolve(REPO_ROOT);
    const targetPath = path.resolve(REPO_ROOT, outputName + '.txt');
    if (!targetPath.startsWith(baseDir + path.sep) && targetPath !== baseDir) {
      return { ok: false, error: `Invalid output name` };
    }

    if (!fs.existsSync(srcTxt)) {
      // whisperx may write <name>.txt or <name>_diarized.txt — try both
      const alt = path.join(dir, base + '_diarized.txt');
      if (!fs.existsSync(alt)) {
        return { ok: false, error: `Transcript file not found: ${srcTxt}` };
      }
      fs.copyFileSync(alt, targetPath);
    } else {
      fs.copyFileSync(srcTxt, targetPath);
    }
    return { ok: true, filename: outputName + '.txt' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
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
