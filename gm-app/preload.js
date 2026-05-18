const { contextBridge, ipcRenderer } = require('electron');
const { marked } = require('marked');

marked.use({
  gfm: true,
  breaks: false,
});

contextBridge.exposeInMainWorld('api', {
  // File access
  listMarkdownFiles: () => ipcRenderer.invoke('list-markdown-files'),
  listMapFiles: () => ipcRenderer.invoke('list-map-files'),
  readFile: (filename) => ipcRenderer.invoke('read-file', filename),

  // State persistence
  loadState: () => ipcRenderer.invoke('load-state'),
  saveState: (state) => ipcRenderer.invoke('save-state', state),
  loadHotspots: () => ipcRenderer.invoke('load-hotspots'),
  saveHotspots: (hotspots) => ipcRenderer.invoke('save-hotspots', hotspots),

  // Markdown rendering
  parseMarkdown: (text) => marked.parse(text),

  // Live file-change events from the watcher
  onFileChanged: (callback) => {
    ipcRenderer.on('file-changed', (_event, data) => callback(data));
  },
  offFileChanged: () => {
    ipcRenderer.removeAllListeners('file-changed');
  },

  // Map image URL builder
  mapUrl: (filename) => `gmapp://maps/${encodeURIComponent(filename)}`,

  // Ingest pipeline
  ingestLoadSettings: () => ipcRenderer.invoke('ingest:load-settings'),
  ingestSaveSettings: (s) => ipcRenderer.invoke('ingest:save-settings', s),
  ingestCheckDeps: () => ipcRenderer.invoke('ingest:check-deps'),
  ingestPickFile: () => ipcRenderer.invoke('ingest:pick-file'),
  ingestSetupVenv: () => ipcRenderer.invoke('ingest:setup-venv'),
  ingestRunFfmpeg: (src, n) => ipcRenderer.invoke('ingest:run-ffmpeg', src, n),
  ingestRunWhisperx: (wav, n, tok) => ipcRenderer.invoke('ingest:run-whisperx', wav, n, tok),
  ingestCopyTranscript: (src, name) => ipcRenderer.invoke('ingest:copy-transcript', src, name),
  onIngestLog: (cb) => ipcRenderer.on('ingest:log', (_e, d) => cb(d)),
  offIngestLog: () => ipcRenderer.removeAllListeners('ingest:log'),
});
