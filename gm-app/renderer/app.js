'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let mdFiles = [];
let mapFiles = [];
let hotspots = {};     // { "filename.png": [ { id, x, y, w, h, label, linkedFile, color } ] }
let appState = {};     // campaign tracker state

let currentView = 'welcome';  // 'welcome' | 'map' | 'content' | 'tracker'
let currentMap = null;
let currentFile = null;
let activeTrackerTab = 'characters';
let activeNavItem = null;

let editMode = false;
let dragging = false;
let dragStart = null;
let dragRect = null;
let dragEl = null;

const DEFAULT_STATE = {
  version: 1,
  characters: {},
  cases: {},
  handouts: {},
  gmNotes: { general: '', session1: '', session2: '', session3: '', session4: '', session5: '' },
  currentSession: 5,
};

// ── Map groups (exterior/interior pairing) ─────────────────────────────────
const MAP_GROUPS = [
  { label: 'Local Area',         maps: ['RoselakeLocalArea.png'] },
  { label: 'Downtown Roselake',  maps: ['DowntownRoselake.png'] },
  { label: 'Castle Roselake',    maps: ['CastleRoselake.png', 'CastleRoselakeInterior.jpg'] },
  { label: 'Collapsed Farmhouse',maps: ['CollapsedFarmhouseExterior.png', 'CollapsedFarmhouseInterior.png'] },
  { label: 'Old Radio Station',  maps: ['OldRadioStationExterior.png', 'OldRadioStationInterior.png'] },
  { label: 'Roselake Academy',   maps: ['RoselakeAcademyExterior.png', 'RoselakeAcademyInterior.png'] },
  { label: "Sam & Charlie's",    maps: ["SamAndCharlie's.png", "SamAndCharlie'sInterior.png"] },
  { label: "Tony's Diner",       maps: ["Tony'sDinerExterior.png", "Tony'sDinerInterior.png"] },
];

const MAP_LABEL = (f) => {
  if (f.toLowerCase().includes('interior')) return 'Interior';
  if (f.toLowerCase().includes('exterior')) return 'Exterior';
  return 'Map';
};

// ── File categorisation ────────────────────────────────────────────────────
const CASE_FILES = [
  'Anglerfish Thread.md',
  'The Antimemetic Killer.md',
  'Lonely Painting.md',
  'Mirror Haunt.md',
  'The Case of the Blurred Woman.md',
  'The Weeping House.md',
  'The Scratching.md',
];

const CATEGORIES = {
  cases: (f) => CASE_FILES.includes(f),
  handouts: (f) => /handout/i.test(f),
  sessions: (f) => /^session \d/i.test(f),
  creatures: (f) => /(creature|anglerfish|mirror haunt \()/i.test(f),
  lore: (f) => /(entities|timeline|catalyst|forgotten|freewrite|raw roselake|plan\.md)/i.test(f),
  locations: (f) => /(locations|roselake,|rose lake|castle|academy|diner|farmhouse|hospital|cemetery|fire station|sheriff|fields|farms|town center|mount|radio tower|library|store|institute|monitoring|convenience)/i.test(f),
  characters: () => true, // catch-all
};

function categorise(files) {
  const cats = { cases: [], handouts: [], sessions: [], creatures: [], lore: [], locations: [], characters: [] };
  for (const f of files) {
    const key = Object.keys(CATEGORIES).find(k => CATEGORIES[k](f));
    cats[key].push(f);
  }
  return cats;
}

function fileLabel(filename) {
  return filename.replace(/\.md$/, '');
}

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  [mdFiles, mapFiles, hotspots] = await Promise.all([
    window.api.listMarkdownFiles(),
    window.api.listMapFiles(),
    window.api.loadHotspots(),
  ]);

  const saved = await window.api.loadState();
  appState = mergeState(DEFAULT_STATE, saved || {});

  renderSidebar();
  showWelcome();

  window.api.onFileChanged(handleFileChanged);
}

function mergeState(defaults, saved) {
  const out = JSON.parse(JSON.stringify(defaults));
  if (saved.characters) out.characters = { ...saved.characters };
  if (saved.cases) out.cases = { ...saved.cases };
  if (saved.handouts) out.handouts = { ...saved.handouts };
  if (saved.gmNotes) out.gmNotes = { ...out.gmNotes, ...saved.gmNotes };
  if (saved.currentSession) out.currentSession = saved.currentSession;
  return out;
}

// ── Sidebar ────────────────────────────────────────────────────────────────
function renderSidebar() {
  const nav = document.getElementById('sidebar-nav');
  const cats = categorise(mdFiles);
  nav.innerHTML = '';

  // Maps
  nav.appendChild(buildSection('⌖', 'Maps', buildMapsContent(), true));

  // Cases
  nav.appendChild(buildSection('◈', 'Cases', buildFileList(cats.cases, 'case'), false));

  // Characters
  nav.appendChild(buildSection('◉', 'Characters', buildFileList(cats.characters, 'character'), false));

  // Locations
  nav.appendChild(buildSection('◎', 'Locations', buildFileList(cats.locations, 'location'), false));

  // Handouts
  nav.appendChild(buildSection('◻', 'Handouts', buildFileList(cats.handouts, 'handout'), false));

  // Sessions
  nav.appendChild(buildSection('◷', 'Sessions', buildFileList(cats.sessions, 'session'), false));

  // Lore
  nav.appendChild(buildSection('◌', 'Lore & World', buildFileList(cats.lore, 'lore'), false));

  // Tracker
  const trackerBtn = document.createElement('button');
  trackerBtn.className = 'nav-tracker';
  trackerBtn.id = 'nav-tracker-btn';
  trackerBtn.innerHTML = '<span>◈</span> Campaign Tracker';
  trackerBtn.addEventListener('click', () => {
    setActiveNav(trackerBtn);
    showTracker();
  });
  nav.appendChild(trackerBtn);

  const ingestBtn = document.createElement('button');
  ingestBtn.className = 'nav-tracker';
  ingestBtn.id = 'nav-ingest-btn';
  ingestBtn.innerHTML = '<span>⏺</span> Ingest Session Recording';
  ingestBtn.addEventListener('click', () => openIngestWizard());
  nav.appendChild(ingestBtn);
}

function buildSection(icon, label, contentEl, startOpen) {
  const section = document.createElement('div');
  section.className = 'nav-section';

  const toggle = document.createElement('button');
  toggle.className = 'section-toggle' + (startOpen ? ' open' : '');
  toggle.innerHTML = `<span class="section-icon">${icon}</span><span class="section-label">${label}</span><span class="chevron">▾</span>`;

  const content = document.createElement('div');
  content.className = 'section-content' + (startOpen ? ' open' : '');
  content.appendChild(contentEl);

  toggle.addEventListener('click', () => {
    toggle.classList.toggle('open');
    content.classList.toggle('open');
  });

  section.appendChild(toggle);
  section.appendChild(content);
  return section;
}

function buildMapsContent() {
  const wrap = document.createElement('div');
  const knownMapFiles = new Set(mapFiles);

  for (const group of MAP_GROUPS) {
    const available = group.maps.filter(m => knownMapFiles.has(m));
    if (!available.length) continue;

    const groupEl = document.createElement('div');
    groupEl.className = 'nav-map-group';

    if (available.length === 1) {
      const btn = makeNavItem(group.label, () => { showMap(available[0]); });
      groupEl.appendChild(btn);
    } else {
      const header = document.createElement('button');
      header.className = 'nav-map-group-header';
      header.textContent = group.label;

      const sub = document.createElement('div');
      sub.className = 'nav-map-sub';

      for (const mf of available) {
        const btn = makeNavItem(MAP_LABEL(mf), () => showMap(mf));
        btn.style.paddingLeft = '44px';
        sub.appendChild(btn);
      }

      let subOpen = false;
      header.addEventListener('click', () => {
        subOpen = !subOpen;
        header.classList.toggle('open', subOpen);
        sub.classList.toggle('open', subOpen);
        if (subOpen && available.length) showMap(available[0]);
      });

      groupEl.appendChild(header);
      groupEl.appendChild(sub);
    }

    wrap.appendChild(groupEl);
  }

  // Any maps not in a group
  const groupedMaps = new Set(MAP_GROUPS.flatMap(g => g.maps));
  const extras = mapFiles.filter(m => !groupedMaps.has(m));
  for (const mf of extras) {
    wrap.appendChild(makeNavItem(fileLabel(mf), () => showMap(mf)));
  }

  if (!wrap.children.length) {
    const empty = document.createElement('div');
    empty.className = 'section-empty';
    empty.textContent = 'No maps found';
    wrap.appendChild(empty);
  }

  return wrap;
}

function buildFileList(files, _category) {
  const wrap = document.createElement('div');
  if (!files.length) {
    const empty = document.createElement('div');
    empty.className = 'section-empty';
    empty.textContent = 'None found';
    wrap.appendChild(empty);
    return wrap;
  }
  for (const f of files.sort()) {
    wrap.appendChild(makeNavItem(fileLabel(f), () => showContent(f), f));
  }
  return wrap;
}

function makeNavItem(label, onClick, dataFile) {
  const btn = document.createElement('button');
  btn.className = 'nav-item';
  btn.textContent = label;
  if (dataFile) btn.dataset.file = dataFile;
  btn.addEventListener('click', () => {
    setActiveNav(btn);
    onClick();
  });
  return btn;
}

function setActiveNav(el) {
  if (activeNavItem) activeNavItem.classList.remove('active');
  el.classList.add('active');
  activeNavItem = el;
}

// ── Welcome ────────────────────────────────────────────────────────────────
function showWelcome() {
  currentView = 'welcome';
  const cats = categorise(mdFiles);
  const casesDone = Object.values(appState.cases).filter(c => c.status === 'solved').length;

  setToolbar('Roselake, Nebraska &bull; March 1981', []);
  setMainContent(`
    <div class="welcome">
      <div class="welcome-title">ROSELAKE</div>
      <div class="welcome-sub">Call of Cthulhu &bull; Nebraska, 1981 &bull; Session ${appState.currentSession}</div>
      <div class="welcome-stats">
        <div class="welcome-stat"><div class="num">${mdFiles.length}</div><div class="lbl">Notes</div></div>
        <div class="welcome-stat"><div class="num">${mapFiles.length}</div><div class="lbl">Maps</div></div>
        <div class="welcome-stat"><div class="num">${cats.cases.length}</div><div class="lbl">Cases</div></div>
        <div class="welcome-stat"><div class="num">${cats.characters.length}</div><div class="lbl">Characters</div></div>
        <div class="welcome-stat"><div class="num">${casesDone}/${cats.cases.length}</div><div class="lbl">Solved</div></div>
      </div>
      <div class="welcome-hint">Select a map or note from the sidebar &bull; Use the Campaign Tracker to log what players know</div>
    </div>
  `);
}

// ── Map view ───────────────────────────────────────────────────────────────
function showMap(mapFilename) {
  currentView = 'map';
  currentMap = mapFilename;
  editMode = false;

  const label = mapFilename.replace(/\.(png|jpg|jpeg)$/i, '').replace(/([A-Z])/g, ' $1').trim();

  setToolbar(label, [
    { id: 'btn-edit-hotspots', label: 'Edit Hotspots', onClick: toggleEditMode },
    { id: 'btn-clear-hotspots', label: 'Clear All', onClick: clearHotspots, danger: true },
  ]);

  const view = document.createElement('div');
  view.className = 'map-view';
  view.id = 'map-view';

  const container = document.createElement('div');
  container.className = 'map-container view-mode';
  container.id = 'map-container';

  const img = document.createElement('img');
  img.className = 'map-img';
  img.id = 'map-img';
  img.src = window.api.mapUrl(mapFilename);
  img.alt = label;
  img.draggable = false;

  const hotspotLayer = document.createElement('div');
  hotspotLayer.className = 'hotspot-layer';
  hotspotLayer.id = 'hotspot-layer';

  container.appendChild(img);
  container.appendChild(hotspotLayer);
  view.appendChild(container);

  const mainContent = document.getElementById('main-content');
  mainContent.innerHTML = '';
  mainContent.appendChild(view);

  img.addEventListener('load', () => renderHotspots());

  setupMapEvents(container, img);

  // Close side panel when switching maps
  closeSidePanel();
}

function renderHotspots() {
  const layer = document.getElementById('hotspot-layer');
  if (!layer) return;
  layer.innerHTML = '';

  const spots = hotspots[currentMap] || [];
  const img = document.getElementById('map-img');
  if (!img) return;

  for (const spot of spots) {
    const el = document.createElement('div');
    el.className = 'hotspot';
    el.dataset.id = spot.id;
    el.style.left   = spot.x + '%';
    el.style.top    = spot.y + '%';
    el.style.width  = spot.w + '%';
    el.style.height = spot.h + '%';
    el.style.borderColor = spot.color || 'var(--red)';
    el.style.background  = hexToRgba(spot.color || '#8b1a1a', 0.18);

    const labelEl = document.createElement('div');
    labelEl.className = 'hotspot-label';
    labelEl.textContent = spot.label || spot.linkedFile || '';
    el.appendChild(labelEl);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!editMode && spot.linkedFile) {
        openSidePanel(spot.linkedFile);
      } else if (editMode) {
        if (confirm(`Delete hotspot "${spot.label || spot.linkedFile}"?`)) {
          removeHotspot(spot.id);
        }
      }
    });

    layer.appendChild(el);
  }
}

function setupMapEvents(container, img) {
  container.addEventListener('mousedown', onMapMouseDown);
  container.addEventListener('mousemove', onMapMouseMove);
  container.addEventListener('mouseup', onMapMouseUp);
  container.addEventListener('mouseleave', () => {
    if (dragging) {
      dragging = false;
      if (dragEl) { dragEl.remove(); dragEl = null; }
    }
  });
}

function onMapMouseDown(e) {
  if (!editMode) return;
  e.preventDefault();
  const img = document.getElementById('map-img');
  const rect = img.getBoundingClientRect();
  dragStart = {
    x: ((e.clientX - rect.left) / rect.width) * 100,
    y: ((e.clientY - rect.top) / rect.height) * 100,
  };
  dragging = true;

  dragEl = document.createElement('div');
  dragEl.className = 'hotspot-drag';
  dragEl.style.left   = dragStart.x + '%';
  dragEl.style.top    = dragStart.y + '%';
  dragEl.style.width  = '0%';
  dragEl.style.height = '0%';
  document.getElementById('map-container').appendChild(dragEl);
}

function onMapMouseMove(e) {
  if (!dragging || !dragEl) return;
  const img = document.getElementById('map-img');
  const rect = img.getBoundingClientRect();
  const cx = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
  const cy = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

  const x = Math.min(dragStart.x, cx);
  const y = Math.min(dragStart.y, cy);
  const w = Math.abs(cx - dragStart.x);
  const h = Math.abs(cy - dragStart.y);

  dragEl.style.left   = x + '%';
  dragEl.style.top    = y + '%';
  dragEl.style.width  = w + '%';
  dragEl.style.height = h + '%';
}

function onMapMouseUp(e) {
  if (!dragging) return;
  dragging = false;

  const img = document.getElementById('map-img');
  const rect = img.getBoundingClientRect();
  const cx = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
  const cy = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

  const x = Math.min(dragStart.x, cx);
  const y = Math.min(dragStart.y, cy);
  const w = Math.abs(cx - dragStart.x);
  const h = Math.abs(cy - dragStart.y);

  if (dragEl) { dragEl.remove(); dragEl = null; }

  if (w < 1 || h < 1) return; // too small, ignore
  showNewHotspotModal(x, y, w, h);
}

function toggleEditMode() {
  editMode = !editMode;
  const container = document.getElementById('map-container');
  const btn = document.getElementById('btn-edit-hotspots');
  if (!container || !btn) return;

  container.classList.toggle('edit-mode', editMode);
  container.classList.toggle('view-mode', !editMode);
  btn.classList.toggle('active', editMode);
  btn.textContent = editMode ? 'Done Editing' : 'Edit Hotspots';

  if (editMode) {
    showToast('Edit mode: drag rectangles on the map to create hotspots. Click an existing hotspot to delete it.');
  }
}

function removeHotspot(id) {
  if (!hotspots[currentMap]) return;
  hotspots[currentMap] = hotspots[currentMap].filter(s => s.id !== id);
  window.api.saveHotspots(hotspots);
  renderHotspots();
}

function clearHotspots() {
  if (!hotspots[currentMap] || !hotspots[currentMap].length) return;
  if (!confirm(`Clear all hotspots from this map?`)) return;
  hotspots[currentMap] = [];
  window.api.saveHotspots(hotspots);
  renderHotspots();
  showToast('All hotspots cleared.');
}

function showNewHotspotModal(x, y, w, h) {
  const modal = document.getElementById('modal-overlay');
  document.getElementById('modal-header').textContent = 'New Hotspot';

  const fileOptions = mdFiles.map(f =>
    `<option value="${f}">${fileLabel(f)}</option>`
  ).join('');

  const colors = ['#8b1a1a','#c0392b','#c8a96e','#2d5a2d','#1a3a6b','#6b4a1a','#6b1a6b','#1a6b6b'];
  const swatches = colors.map((c, i) =>
    `<div class="color-swatch${i === 0 ? ' selected' : ''}" data-color="${c}" style="background:${c}" title="${c}"></div>`
  ).join('');

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-field">
      <label>Hotspot Label</label>
      <input type="text" id="hs-label" placeholder="e.g. Main Entrance" autofocus>
    </div>
    <div class="modal-field">
      <label>Linked Note</label>
      <select id="hs-file"><option value="">— none —</option>${fileOptions}</select>
    </div>
    <div class="modal-field">
      <label>Colour</label>
      <div class="color-swatches" id="hs-colors">${swatches}</div>
    </div>
  `;

  document.getElementById('modal-footer').innerHTML = `
    <button class="btn" id="modal-cancel">Cancel</button>
    <button class="btn btn-primary" id="modal-create">Create</button>
  `;

  // Color swatch selection
  const swatchEls = document.querySelectorAll('.color-swatch');
  swatchEls.forEach(s => {
    s.addEventListener('click', () => {
      swatchEls.forEach(el => el.classList.remove('selected'));
      s.classList.add('selected');
    });
  });

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-create').addEventListener('click', () => {
    const label = document.getElementById('hs-label').value.trim();
    const linkedFile = document.getElementById('hs-file').value;
    const color = document.querySelector('.color-swatch.selected')?.dataset.color || '#8b1a1a';

    if (!label && !linkedFile) {
      showToast('Please enter a label or choose a linked note.');
      return;
    }

    const spot = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      x: +x.toFixed(3), y: +y.toFixed(3),
      w: +w.toFixed(3), h: +h.toFixed(3),
      label: label || fileLabel(linkedFile),
      linkedFile: linkedFile || null,
      color,
    };

    if (!hotspots[currentMap]) hotspots[currentMap] = [];
    hotspots[currentMap].push(spot);
    window.api.saveHotspots(hotspots);
    renderHotspots();
    closeModal();
    showToast(`Hotspot "${spot.label}" added.`);
  });

  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('hs-label')?.focus(), 50);
}

// ── Content view ───────────────────────────────────────────────────────────
async function showContent(filename) {
  currentView = 'content';
  currentFile = filename;

  setToolbar(fileLabel(filename), []);

  const raw = await window.api.readFile(filename);
  if (raw === null) {
    setMainContent(`<div class="content-view"><div class="markdown-body"><p style="color:var(--text-3);font-style:italic">File not found: ${filename}</p></div></div>`);
    return;
  }

  renderMarkdownContent(raw, document.getElementById('main-content'));
}

function renderMarkdownContent(raw, container) {
  const processed = processWikilinks(raw);
  const html = window.api.parseMarkdown(processed);

  container.innerHTML = `<div class="content-view"><div class="markdown-body">${html}</div></div>`;

  // Wire up wikilink clicks
  container.querySelectorAll('.wikilink').forEach(el => {
    el.addEventListener('click', () => {
      const target = el.dataset.file;
      if (mdFiles.includes(target)) {
        // Find and activate the nav item
        const navItem = document.querySelector(`[data-file="${CSS.escape(target)}"]`);
        if (navItem) setActiveNav(navItem);
        showContent(target);
      } else {
        el.classList.add('broken');
        showToast(`Note not found: "${el.dataset.file}"`);
      }
    });
  });
}

function processWikilinks(text) {
  // [[File|Display]] and [[File]]
  return text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, file, display) => {
    const label = display || file;
    const target = file.endsWith('.md') ? file : file + '.md';
    return `<span class="wikilink" data-file="${target}">${label}</span>`;
  });
}

// ── Side panel ─────────────────────────────────────────────────────────────
async function openSidePanel(filename) {
  const panel = document.getElementById('side-panel');
  document.getElementById('side-panel-title').textContent = fileLabel(filename);

  const raw = await window.api.readFile(filename);
  const body = document.getElementById('side-panel-body');

  if (raw === null) {
    body.innerHTML = `<p style="color:var(--text-3);font-style:italic">File not found: ${filename}</p>`;
  } else {
    const processed = processWikilinks(raw);
    const html = window.api.parseMarkdown(processed);
    body.innerHTML = `<div class="markdown-body">${html}</div>`;

    body.querySelectorAll('.wikilink').forEach(el => {
      el.addEventListener('click', () => {
        if (mdFiles.includes(el.dataset.file)) openSidePanel(el.dataset.file);
      });
    });
  }

  panel.classList.remove('hidden');
}

function closeSidePanel() {
  document.getElementById('side-panel').classList.add('hidden');
}

// ── Tracker view ───────────────────────────────────────────────────────────
function showTracker() {
  currentView = 'tracker';
  setToolbar('Campaign Tracker', [
    { id: 'btn-save-state', label: 'Save', onClick: saveState },
  ]);

  const cats = categorise(mdFiles);

  const view = document.createElement('div');
  view.className = 'tracker-view';

  // Tabs
  const tabs = document.createElement('div');
  tabs.className = 'tracker-tabs';
  const tabDefs = [
    { id: 'characters', label: 'Characters' },
    { id: 'cases',      label: 'Cases' },
    { id: 'handouts',   label: 'Handouts' },
    { id: 'notes',      label: 'GM Notes' },
  ];
  for (const t of tabDefs) {
    const btn = document.createElement('button');
    btn.className = 'tracker-tab' + (t.id === activeTrackerTab ? ' active' : '');
    btn.textContent = t.label;
    btn.dataset.tab = t.id;
    btn.addEventListener('click', () => {
      activeTrackerTab = t.id;
      document.querySelectorAll('.tracker-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTrackerContent(content, cats);
    });
    tabs.appendChild(btn);
  }

  const content = document.createElement('div');
  content.className = 'tracker-content';
  content.id = 'tracker-content';

  view.appendChild(tabs);
  view.appendChild(content);

  const mainContent = document.getElementById('main-content');
  mainContent.innerHTML = '';
  mainContent.appendChild(view);

  renderTrackerContent(content, cats);
}

function renderTrackerContent(container, cats) {
  container.innerHTML = '';
  switch (activeTrackerTab) {
    case 'characters': renderCharactersTab(container, cats.characters); break;
    case 'cases':      renderCasesTab(container, cats.cases); break;
    case 'handouts':   renderHandoutsTab(container, cats.handouts); break;
    case 'notes':      renderNotesTab(container); break;
  }
}

function renderCharactersTab(container, files) {
  const grid = document.createElement('div');
  grid.className = 'card-grid';

  for (const f of files) {
    if (!appState.characters[f]) {
      appState.characters[f] = { status: 'unknown', notes: '' };
    }
    const state = appState.characters[f];

    const card = document.createElement('div');
    card.className = 'tracker-card';

    const name = document.createElement('div');
    name.className = 'card-name';
    name.title = fileLabel(f);
    name.textContent = fileLabel(f);
    name.style.cursor = 'pointer';
    name.addEventListener('click', () => {
      const navItem = document.querySelector(`[data-file="${CSS.escape(f)}"]`);
      if (navItem) setActiveNav(navItem);
      showContent(f);
    });

    const statusBtns = document.createElement('div');
    statusBtns.className = 'card-status';

    for (const val of ['unknown','met','ally','suspicious','dead']) {
      const btn = document.createElement('button');
      btn.className = 'status-btn' + (state.status === val ? ' selected' : '');
      btn.dataset.val = val;
      btn.textContent = val;
      btn.addEventListener('click', () => {
        state.status = val;
        statusBtns.querySelectorAll('.status-btn').forEach(b => {
          b.classList.toggle('selected', b.dataset.val === val);
        });
        saveState();
      });
      statusBtns.appendChild(btn);
    }

    const notes = document.createElement('textarea');
    notes.className = 'card-notes';
    notes.placeholder = 'Notes…';
    notes.value = state.notes;
    notes.addEventListener('input', () => {
      state.notes = notes.value;
    });
    notes.addEventListener('blur', () => saveState());

    card.appendChild(name);
    card.appendChild(statusBtns);
    card.appendChild(notes);
    grid.appendChild(card);
  }

  container.appendChild(grid);
}

function renderCasesTab(container, files) {
  const list = document.createElement('div');
  list.className = 'case-list';

  const allCases = [...new Set([...files, ...CASE_FILES.filter(f => mdFiles.includes(f))])];

  for (const f of allCases) {
    if (!appState.cases[f]) {
      appState.cases[f] = { status: 'unknown', notes: '' };
    }
    const state = appState.cases[f];

    const row = document.createElement('div');
    row.className = 'case-row';

    const header = document.createElement('div');
    header.className = 'case-row-header';

    const nameEl = document.createElement('div');
    nameEl.className = 'case-name';
    nameEl.textContent = fileLabel(f);
    nameEl.addEventListener('click', () => {
      const navItem = document.querySelector(`[data-file="${CSS.escape(f)}"]`);
      if (navItem) setActiveNav(navItem);
      showContent(f);
    });

    header.appendChild(nameEl);

    const statusBtns = document.createElement('div');
    statusBtns.className = 'card-status';

    for (const val of ['unknown','active','investigating','solved','cold']) {
      const btn = document.createElement('button');
      btn.className = 'status-btn' + (state.status === val ? ' selected' : '');
      btn.dataset.val = val;
      btn.textContent = val;
      btn.addEventListener('click', () => {
        state.status = val;
        statusBtns.querySelectorAll('.status-btn').forEach(b => {
          b.classList.toggle('selected', b.dataset.val === val);
        });
        saveState();
      });
      statusBtns.appendChild(btn);
    }

    const notes = document.createElement('textarea');
    notes.className = 'card-notes';
    notes.placeholder = 'GM notes on this case…';
    notes.value = state.notes;
    notes.addEventListener('input', () => { state.notes = notes.value; });
    notes.addEventListener('blur', () => saveState());

    row.appendChild(header);
    row.appendChild(statusBtns);
    row.appendChild(notes);
    list.appendChild(row);
  }

  container.appendChild(list);
}

function renderHandoutsTab(container, files) {
  for (const f of files) {
    if (!appState.handouts[f]) {
      appState.handouts[f] = { prepared: false, revealed: false };
    }
    const state = appState.handouts[f];

    const row = document.createElement('div');
    row.className = 'handout-row';

    const name = document.createElement('div');
    name.className = 'handout-name';
    name.textContent = fileLabel(f);
    name.style.cursor = 'pointer';
    name.addEventListener('click', () => {
      const navItem = document.querySelector(`[data-file="${CSS.escape(f)}"]`);
      if (navItem) setActiveNav(navItem);
      showContent(f);
    });

    row.appendChild(name);

    for (const { key, label } of [{ key: 'prepared', label: 'Ready' }, { key: 'revealed', label: 'Revealed' }]) {
      const wrap = document.createElement('div');
      wrap.className = 'toggle-wrap';

      const lbl = document.createElement('span');
      lbl.className = 'toggle-label';
      lbl.textContent = label;

      const toggleEl = document.createElement('label');
      toggleEl.className = 'toggle';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = state[key];
      input.addEventListener('change', () => {
        state[key] = input.checked;
        saveState();
      });

      const slider = document.createElement('span');
      slider.className = 'toggle-slider';

      toggleEl.appendChild(input);
      toggleEl.appendChild(slider);
      wrap.appendChild(lbl);
      wrap.appendChild(toggleEl);
      row.appendChild(wrap);
    }

    container.appendChild(row);
  }

  if (!files.length) {
    container.innerHTML = '<p style="color:var(--text-3);font-style:italic;padding:8px 0">No handout files found.</p>';
  }
}

function renderNotesTab(container) {
  const area = document.createElement('div');
  area.className = 'notes-area';

  const sessionOptions = [
    { val: 'general', label: 'General Notes' },
    { val: 'session1', label: 'Session 1' },
    { val: 'session2', label: 'Session 2' },
    { val: 'session3', label: 'Session 3' },
    { val: 'session4', label: 'Session 4' },
    { val: 'session5', label: 'Session 5' },
  ];

  const select = document.createElement('select');
  select.className = 'notes-session-select';
  for (const { val, label } of sessionOptions) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    opt.selected = val === `session${appState.currentSession}`;
    select.appendChild(opt);
  }

  const textarea = document.createElement('textarea');
  textarea.className = 'notes-textarea';
  textarea.placeholder = 'GM notes for this session…';
  textarea.value = appState.gmNotes[select.value] || '';

  select.addEventListener('change', () => {
    textarea.value = appState.gmNotes[select.value] || '';
  });

  textarea.addEventListener('input', () => {
    appState.gmNotes[select.value] = textarea.value;
  });
  textarea.addEventListener('blur', () => saveState());

  area.appendChild(select);
  area.appendChild(textarea);
  container.appendChild(area);
}

// ── State persistence ──────────────────────────────────────────────────────
async function saveState() {
  await window.api.saveState(appState);
}

// ── Toolbar ────────────────────────────────────────────────────────────────
function setToolbar(title, buttons) {
  const toolbar = document.getElementById('main-toolbar');
  toolbar.innerHTML = `<div class="toolbar-title">${title}</div>`;

  for (const b of buttons) {
    if (b === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'toolbar-sep';
      toolbar.appendChild(sep);
      continue;
    }
    const btn = document.createElement('button');
    btn.className = 'toolbar-btn' + (b.danger ? ' danger' : '');
    btn.id = b.id;
    btn.textContent = b.label;
    btn.addEventListener('click', b.onClick);
    toolbar.appendChild(btn);
  }
}

function setMainContent(html) {
  document.getElementById('main-content').innerHTML = html;
}

// ── File watcher ───────────────────────────────────────────────────────────
async function handleFileChanged({ type, filename }) {
  if (!filename.endsWith('.md')) return;

  showToast(`${type === 'add' ? 'New file' : type === 'remove' ? 'File removed' : 'Updated'}: ${filename}`);

  // Refresh file list
  mdFiles = await window.api.listMarkdownFiles();
  renderSidebar();

  // Re-render if currently viewing the changed file
  if (type !== 'remove' && currentView === 'content' && currentFile === filename) {
    await showContent(filename);
  }

  // Re-render welcome stats
  if (currentView === 'welcome') {
    showWelcome();
  }
}

// ── Modal ──────────────────────────────────────────────────────────────────
function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay._ingestRunning = false;
  overlay.classList.add('hidden');
  window.api.offIngestLog();
}

document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
  const overlay = document.getElementById('modal-overlay');
  if (e.target === overlay && !overlay._ingestRunning) closeModal();
});

// ── Side panel close button ────────────────────────────────────────────────
document.getElementById('side-panel-close')?.addEventListener('click', closeSidePanel);

// ── Toast ──────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden', 'fade-out');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 3500);
}

// ── Utility ────────────────────────────────────────────────────────────────
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Ingest Wizard ──────────────────────────────────────────────────────────

let ingestState = {
  outputName: '',
  speakers: 2,
  hfToken: '',
  hfTokenSaved: false,
  sourcePath: '',
  wavPath: '',
  finalFilename: '',
};

async function openIngestWizard() {
  const settings = await window.api.ingestLoadSettings();
  ingestState = {
    outputName: '',
    speakers: 2,
    hfToken: settings.hfToken || '',
    hfTokenSaved: !!settings.hfToken,
    sourcePath: '',
    wavPath: '',
    finalFilename: '',
  };
  renderIngestStep('config');
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function renderIngestStep(step) {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');

  // Prevent backdrop-click closing during active processing
  overlay._ingestRunning = (step === 'run');

  switch (step) {
    case 'config':  renderIngestConfig();  break;
    case 'deps':    renderIngestDeps();    break;
    case 'pick':    renderIngestPick();    break;
    case 'run':     renderIngestRun();     break;
    case 'done':    renderIngestDone();    break;
  }
}

function ingestHeader(title) {
  document.getElementById('modal-header').innerHTML =
    `<span class="ingest-step-label">${title}</span>`;
}

function renderIngestConfig() {
  ingestHeader('Ingest Session Recording — Setup');

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-field">
      <label>Output filename (no extension)</label>
      <input type="text" id="ing-name" placeholder="e.g. RoselakeSession7KelvinAlex" value="${escHtml(ingestState.outputName)}">
    </div>
    <div class="modal-field">
      <label>Number of people in the session (including Keeper)</label>
      <input type="number" id="ing-speakers" min="1" max="20" value="${ingestState.speakers}">
    </div>
    ${!ingestState.hfTokenSaved ? `
    <div class="modal-field">
      <label>HuggingFace token (for speaker diarization)</label>
      <input type="text" id="ing-hftoken" placeholder="hf_..." value="${escHtml(ingestState.hfToken)}" autocomplete="off" spellcheck="false">
      <div class="ingest-hint">Stored locally in gm-app/state/ingest-settings.json (never committed)</div>
    </div>` : `
    <div class="ingest-hint">HuggingFace token: saved ✓ <button class="ingest-link" id="ing-reset-token">Change</button></div>`}
  `;

  document.getElementById('modal-footer').innerHTML = `
    <button class="btn" id="ing-cancel">Cancel</button>
    <button class="btn btn-primary" id="ing-next">Next: Check Dependencies →</button>
  `;

  document.getElementById('ing-cancel').addEventListener('click', closeModal);

  if (!ingestState.hfTokenSaved) {
    // nothing extra
  } else {
    document.getElementById('ing-reset-token')?.addEventListener('click', () => {
      ingestState.hfTokenSaved = false;
      ingestState.hfToken = '';
      renderIngestConfig();
    });
  }

  document.getElementById('ing-next').addEventListener('click', async () => {
    const name = document.getElementById('ing-name').value.trim();
    const spk = parseInt(document.getElementById('ing-speakers').value, 10);
    if (!name) { showToast('Please enter an output filename.'); return; }
    if (!spk || spk < 1) { showToast('Please enter a valid number of speakers.'); return; }

    ingestState.outputName = name;
    ingestState.speakers = spk;

    if (!ingestState.hfTokenSaved) {
      const tok = document.getElementById('ing-hftoken')?.value.trim();
      if (!tok) { showToast('Please enter your HuggingFace token.'); return; }
      ingestState.hfToken = tok;
      await window.api.ingestSaveSettings({ hfToken: tok });
      ingestState.hfTokenSaved = true;
    }

    renderIngestStep('deps');
  });
}

async function renderIngestDeps() {
  ingestHeader('Ingest Session Recording — Dependencies');

  document.getElementById('modal-body').innerHTML = `<div class="ingest-checking">Checking dependencies…</div>`;
  document.getElementById('modal-footer').innerHTML = '';

  const deps = await window.api.ingestCheckDeps();

  const row = (label, ok, action) => `
    <div class="ingest-dep-row">
      <span class="ingest-dep-icon ${ok ? 'ok' : 'missing'}">${ok ? '✓' : '✗'}</span>
      <span class="ingest-dep-name">${label}</span>
      ${!ok ? `<span class="ingest-dep-action">${action}</span>` : ''}
    </div>`;

  const ffmpegHelp = `<span class="ingest-hint">Install from <strong>ffmpeg.org</strong>, add to PATH, then click Recheck.</span>`;
  const pythonHelp = `<span class="ingest-hint">Install Python 3 from <strong>python.org</strong> and restart the app.</span>`;
  const whisperxNote = (!deps.venv || !deps.whisperx)
    ? `<button class="btn btn-primary ingest-full" id="ing-setup-venv">Set up Python environment (installs whisperx)</button>`
    : '';

  document.getElementById('modal-body').innerHTML = `
    <div class="ingest-deps">
      ${row('Python 3', deps.python, pythonHelp)}
      ${row('ffmpeg', deps.ffmpeg, ffmpegHelp)}
      ${row('Python venv (~/.gm-transcription)', deps.venv, '')}
      ${row('whisperx', deps.whisperx, '')}
    </div>
    ${!deps.python ? `<div class="ingest-warn">Python 3 is required. Install it from python.org and restart the app.</div>` : ''}
    ${(!deps.venv || !deps.whisperx) && deps.python ? whisperxNote : ''}
    <div id="ingest-setup-log" class="ingest-log hidden"></div>
  `;

  const allGood = deps.python && deps.ffmpeg && deps.venv && deps.whisperx;
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn" id="ing-back">← Back</button>
    <button class="btn" id="ing-recheck">Recheck</button>
    ${allGood ? `<button class="btn btn-primary" id="ing-next">Next: Select File →</button>` : ''}
  `;

  document.getElementById('ing-back').addEventListener('click', () => renderIngestStep('config'));
  document.getElementById('ing-recheck').addEventListener('click', () => renderIngestDeps());

  if (allGood) {
    document.getElementById('ing-next').addEventListener('click', () => renderIngestStep('pick'));
  }

  document.getElementById('ing-setup-venv')?.addEventListener('click', async () => {
    document.getElementById('ing-setup-venv').disabled = true;
    const logEl = document.getElementById('ingest-setup-log');
    logEl.classList.remove('hidden');
    logEl.textContent = '';

    window.api.offIngestLog();
    window.api.onIngestLog(({ text }) => {
      logEl.textContent += text;
      logEl.scrollTop = logEl.scrollHeight;
    });

    const result = await window.api.ingestSetupVenv();
    window.api.offIngestLog();

    if (result.ok) {
      showToast('Environment set up successfully.');
    } else {
      showToast('Setup failed — see log above.');
    }
    renderIngestDeps();
  });
}

function renderIngestPick() {
  ingestHeader('Ingest Session Recording — Select File');

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-field">
      <label>Session recording file (.mkv, .mp4, .avi)</label>
      <div class="ingest-pick-row">
        <button class="btn" id="ing-browse">Browse…</button>
        <span id="ing-picked-path" class="ingest-hint">${ingestState.sourcePath ? escHtml(ingestState.sourcePath) : 'No file selected'}</span>
      </div>
    </div>
  `;

  document.getElementById('modal-footer').innerHTML = `
    <button class="btn" id="ing-back">← Back</button>
    <button class="btn btn-primary" id="ing-start"${!ingestState.sourcePath ? ' disabled' : ''}>Convert &amp; Transcribe →</button>
  `;

  document.getElementById('ing-back').addEventListener('click', () => renderIngestStep('deps'));

  document.getElementById('ing-browse').addEventListener('click', async () => {
    const picked = await window.api.ingestPickFile();
    if (picked) {
      ingestState.sourcePath = picked;
      document.getElementById('ing-picked-path').textContent = picked;
      document.getElementById('ing-start').disabled = false;
    }
  });

  document.getElementById('ing-start').addEventListener('click', () => {
    if (!ingestState.sourcePath) { showToast('Please select a recording file.'); return; }
    renderIngestStep('run');
  });
}

async function renderIngestRun() {
  ingestHeader('Ingest Session Recording — Processing');

  document.getElementById('modal-body').innerHTML = `
    <div class="ingest-steps">
      <div class="ingest-phase" id="phase-ffmpeg">
        <span class="ingest-phase-icon" id="phase-icon-ffmpeg">⏳</span>
        <span>Convert to WAV (ffmpeg)</span>
      </div>
      <div class="ingest-phase" id="phase-whisperx">
        <span class="ingest-phase-icon" id="phase-icon-whisperx">○</span>
        <span>Transcribe &amp; diarize (whisperx)</span>
      </div>
    </div>
    <pre id="ingest-run-log" class="ingest-log"></pre>
  `;
  document.getElementById('modal-footer').innerHTML = '';

  const logEl = document.getElementById('ingest-run-log');
  const appendLog = (text) => {
    logEl.textContent += text;
    logEl.scrollTop = logEl.scrollHeight;
  };

  window.api.offIngestLog();
  window.api.onIngestLog(({ step, text }) => {
    appendLog(text);
  });

  // ── ffmpeg ──
  document.getElementById('phase-icon-ffmpeg').textContent = '⏳';
  const ffResult = await window.api.ingestRunFfmpeg(ingestState.sourcePath, ingestState.speakers);

  if (!ffResult.ok) {
    document.getElementById('phase-icon-ffmpeg').textContent = '✗';
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn" id="ing-retry-ff">← Back</button>`;
    document.getElementById('ing-retry-ff').addEventListener('click', () => renderIngestStep('pick'));
    window.api.offIngestLog();
    return;
  }

  document.getElementById('phase-icon-ffmpeg').textContent = '✓';
  ingestState.wavPath = ffResult.wavPath;

  // ── whisperx ──
  document.getElementById('phase-icon-whisperx').textContent = '⏳';
  const wxResult = await window.api.ingestRunWhisperx(
    ingestState.wavPath, ingestState.speakers, ingestState.hfToken
  );
  window.api.offIngestLog();

  if (!wxResult.ok) {
    document.getElementById('phase-icon-whisperx').textContent = '✗';
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn" id="ing-retry-wx">← Back</button>`;
    document.getElementById('ing-retry-wx').addEventListener('click', () => renderIngestStep('pick'));
    return;
  }
  document.getElementById('phase-icon-whisperx').textContent = '✓';

  // ── copy transcript ──
  const copyResult = await window.api.ingestCopyTranscript(
    ingestState.wavPath, ingestState.outputName
  );
  if (!copyResult.ok) {
    appendLog(`\n[error] Could not copy transcript: ${copyResult.error}`);
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn" id="ing-close-err">Close</button>`;
    document.getElementById('ing-close-err').addEventListener('click', closeModal);
    return;
  }

  ingestState.finalFilename = copyResult.filename;
  renderIngestStep('done');
}

function renderIngestDone() {
  ingestHeader('Ingest Session Recording — Complete');

  document.getElementById('modal-body').innerHTML = `
    <div class="ingest-done">
      <div class="ingest-done-icon">✓</div>
      <div class="ingest-done-msg">Transcript saved to repo root:</div>
      <div class="ingest-done-file">${escHtml(ingestState.finalFilename)}</div>
      <div class="ingest-hint">The file will appear in the sidebar shortly (file watcher will pick it up).</div>
    </div>
  `;

  document.getElementById('modal-footer').innerHTML = `
    <button class="btn" id="ing-close">Close</button>
    <button class="btn btn-primary" id="ing-open">Open Transcript</button>
  `;

  document.getElementById('ing-close').addEventListener('click', closeModal);
  document.getElementById('ing-open').addEventListener('click', async () => {
    closeModal();
    // Give file watcher a moment to pick it up; then open directly
    await new Promise(r => setTimeout(r, 400));
    // Refresh file list and open
    mdFiles = await window.api.listMarkdownFiles();
    // The transcript is a .txt — open it as a raw text file via read-file
    openTxtFile(ingestState.finalFilename);
  });
}

async function openTxtFile(filename) {
  const content = await window.api.readFile(filename);
  if (content === null) {
    showToast(`File not found: ${filename}`);
    return;
  }
  currentView = 'content';
  currentFile = filename;
  document.getElementById('main-toolbar').innerHTML = `<span class="toolbar-title">${escHtml(filename.replace(/\.txt$/, ''))}</span>`;
  document.getElementById('main-content').innerHTML = `<div class="note-body"><pre class="transcript-pre">${escHtml(content)}</pre></div>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Boot ───────────────────────────────────────────────────────────────────
function showFatalError(title, lines) {
  document.getElementById('main-content').innerHTML = `
    <div class="fatal-error">
      <div class="fatal-error-title">${title}</div>
      <div class="fatal-error-body">${lines.map(l => `<p>${l}</p>`).join('')}</div>
    </div>`;
}

if (!window.api) {
  showFatalError(
    'Setup incomplete — app cannot start',
    [
      'The preload script failed to load. This almost always means <code>node_modules</code> is missing or incomplete.',
      'Open a terminal, navigate to the <code>gm-app/</code> directory, and run:',
      '<pre>npm install --omit=dev</pre>',
      'Then close and relaunch the app.',
    ]
  );
} else {
  init().catch(err => {
    console.error(err);
    showFatalError(
      'Startup error',
      [
        `<code>${err.message}</code>`,
        'Check the DevTools console (Ctrl+Shift+I) for the full stack trace.',
      ]
    );
  });
}
