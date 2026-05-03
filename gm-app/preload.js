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
});
