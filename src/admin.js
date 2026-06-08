import './admin.css';
import Sortable from 'sortablejs';
import { lang, fmtDate } from './strings.js';
import { PALETTE, extractId, extractPlaylistId, fuzzyCoord, buildConfig, buildSaveFiles } from './utils.js';
import { T } from './admin-strings.js';
import { hashPassword, verifyPassword } from './auth.js';
import { githubCommit, githubDeleteFile as ghDeleteFile } from './github.js';
import { validatePlaylist, validateIndex } from './schema.js';

const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const YT_API_KEY_STORE = 'muxtape-yt-api-key';
const GH_DEFAULTS = { owner: 'couch', repo: 'listen', branch: 'main' };

function getGHConfig() {
  try { return { ...GH_DEFAULTS, ...JSON.parse(localStorage.getItem('muxtape-gh-config') || '{}') }; }
  catch { return { ...GH_DEFAULTS }; }
}

async function checkAuth() {
  if (IS_LOCAL) return;

  // Migrate: legacy SHA-256 hash (no salt) → force re-setup with PBKDF2
  if (localStorage.getItem('muxtape-admin-hash') && !localStorage.getItem('muxtape-admin-salt')) {
    ['muxtape-admin-hash', 'muxtape-gh-config'].forEach(k => localStorage.removeItem(k));
    sessionStorage.removeItem('muxtape-gh-token');
  }

  const storedHash = localStorage.getItem('muxtape-admin-hash');
  const storedSalt = localStorage.getItem('muxtape-admin-salt');
  const sessionToken = sessionStorage.getItem('muxtape-gh-token');
  const isSetup = !storedHash;
  const needsToken = !isSetup && !sessionToken;
  const gh = getGHConfig();

  await new Promise(resolve => {
    const gate = document.createElement('div');
    gate.id = 'auth-gate';

    // All innerHTML is static — localStorage-derived values set via .value after creation
    if (isSetup) {
      gate.innerHTML = `
        <div id="auth-box">
          <h2>edit tape</h2>
          <p class="auth-hint">First-time setup</p>
          <input type="password" id="auth-pw" placeholder="set a password" autocomplete="new-password">
          <input type="password" id="auth-confirm" placeholder="confirm password" autocomplete="new-password">
          <input type="text" id="auth-token" placeholder="GitHub token (contents: write)" autocomplete="off" spellcheck="false">
          <details id="auth-advanced">
            <summary>GitHub repo</summary>
            <input type="text" id="auth-owner" placeholder="owner">
            <input type="text" id="auth-repo-name" placeholder="repo">
            <input type="text" id="auth-branch" placeholder="branch">
          </details>
          <button id="auth-submit">Set up</button>
          <p id="auth-error"></p>
        </div>
      `;
    } else if (needsToken) {
      gate.innerHTML = `
        <div id="auth-box">
          <h2>edit tape</h2>
          <p class="auth-hint">New session — enter password and token</p>
          <input type="password" id="auth-pw" placeholder="password" autocomplete="current-password">
          <input type="text" id="auth-token" placeholder="GitHub token" autocomplete="off" spellcheck="false">
          <button id="auth-submit">Enter</button>
          <p id="auth-error"></p>
          <button id="auth-reset">Reset credentials</button>
        </div>
      `;
    } else {
      gate.innerHTML = `
        <div id="auth-box">
          <h2>edit tape</h2>
          <input type="password" id="auth-pw" placeholder="password" autocomplete="current-password">
          <button id="auth-submit">Enter</button>
          <p id="auth-error"></p>
          <button id="auth-reset">Reset credentials</button>
        </div>
      `;
    }

    document.body.prepend(gate);

    if (isSetup) {
      document.getElementById('auth-owner').value = gh.owner;
      document.getElementById('auth-repo-name').value = gh.repo;
      document.getElementById('auth-branch').value = gh.branch;
    }

    document.getElementById('auth-pw').focus();
    const errorEl = document.getElementById('auth-error');

    document.getElementById('auth-submit').addEventListener('click', async () => {
      const pw = document.getElementById('auth-pw').value;
      if (!pw) return;
      errorEl.textContent = '';

      if (isSetup) {
        const confirmPw = document.getElementById('auth-confirm').value;
        const token = document.getElementById('auth-token').value.trim();
        if (pw !== confirmPw) { errorEl.textContent = 'Passwords do not match'; return; }
        if (!token) { errorEl.textContent = 'GitHub token is required'; return; }
        const { salt, hash } = await hashPassword(pw);
        localStorage.setItem('muxtape-admin-salt', salt);
        localStorage.setItem('muxtape-admin-hash', hash);
        sessionStorage.setItem('muxtape-gh-token', token);
        localStorage.setItem('muxtape-gh-config', JSON.stringify({
          owner: document.getElementById('auth-owner').value.trim() || GH_DEFAULTS.owner,
          repo: document.getElementById('auth-repo-name').value.trim() || GH_DEFAULTS.repo,
          branch: document.getElementById('auth-branch').value.trim() || GH_DEFAULTS.branch,
        }));
        gate.remove();
        resolve();
      } else if (needsToken) {
        const token = document.getElementById('auth-token').value.trim();
        if (!token) { errorEl.textContent = 'GitHub token is required'; return; }
        if (await verifyPassword(pw, storedSalt, storedHash)) {
          sessionStorage.setItem('muxtape-gh-token', token);
          gate.remove();
          resolve();
        } else {
          errorEl.textContent = 'Incorrect password';
          document.getElementById('auth-pw').value = '';
          document.getElementById('auth-pw').focus();
        }
      } else {
        if (await verifyPassword(pw, storedSalt, storedHash)) {
          gate.remove();
          resolve();
        } else {
          errorEl.textContent = 'Incorrect password';
          document.getElementById('auth-pw').value = '';
          document.getElementById('auth-pw').focus();
        }
      }
    });

    ['auth-pw', 'auth-token'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('auth-submit').click();
      });
    });

    if (!isSetup) {
      document.getElementById('auth-reset').addEventListener('click', () => {
        if (!confirm('Clear admin credentials and start over?')) return;
        ['muxtape-admin-hash', 'muxtape-admin-salt', 'muxtape-gh-config'].forEach(k => localStorage.removeItem(k));
        sessionStorage.removeItem('muxtape-gh-token');
        location.reload();
      });
    }
  });
}

// ── Save dispatch ──

async function saveFiles(files, message) {
  if (IS_LOCAL) {
    for (const { path, content } of files) await localPost(path, content);
  } else {
    const gh = { ...getGHConfig(), token: sessionStorage.getItem('muxtape-gh-token') };
    await githubCommit(files, message, gh);
  }
}

async function deletePlaylistFile(id) {
  if (IS_LOCAL) {
    const res = await fetch('/delete-playlist', { method: 'POST', body: JSON.stringify({ id }) });
    if (!res.ok) throw new Error(`/delete-playlist failed (${res.status})`);
  } else {
    const gh = { ...getGHConfig(), token: sessionStorage.getItem('muxtape-gh-token') };
    await ghDeleteFile(`playlists/${id}.json`, `delete playlist ${id}`, gh);
  }
}

async function localPost(path, content) {
  const endpoint =
    path === 'config.js' ? '/save-config' :
    path === 'playlists/index.json' ? '/save-index' :
    path.startsWith('playlists/') ? '/save-playlist' : null;
  if (!endpoint) throw new Error(`Unknown path: ${path}`);
  const res = await fetch(endpoint, { method: 'POST', body: content });
  if (!res.ok) throw new Error(`${endpoint} failed (${res.status})`);
}

// ── Data ──
let idx = { active: null, ids: [] };
let playlists = {};
let currentId = null;
const state = { title: "", color: "random", tracks: [], pendingId: null, location: null };

// ── Undo state ──
let undoState = null;
let undoTimer = null;

function showUndo(track, index) {
  if (undoTimer) clearTimeout(undoTimer);
  undoState = { track, index };
  document.getElementById('undo-msg').textContent = T.undoRemoved(track.title);
  document.getElementById('undo-bar').hidden = false;
  undoTimer = setTimeout(hideUndo, 5000);
}

function hideUndo() {
  if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
  undoState = null;
  document.getElementById('undo-bar').hidden = true;
}

// ── Init ──
async function init() {
  try {
    const res = await fetch("/playlists/index.json");
    if (!res.ok) throw new Error();
    const rawIdx = await res.json();
    validateIndex(rawIdx);
    idx = rawIdx;
    await Promise.all(idx.ids.map(async id => {
      const r = await fetch(`/playlists/${id}.json`);
      if (r.ok) {
        const pl = await r.json();
        try { validatePlaylist(pl); } catch { return; }
        if (!pl.lastEdited) pl.lastEdited = pl.created || null;
        playlists[id] = pl;
      }
    }));
  } catch {
    const id = String(Date.now());
    idx = { active: id, ids: [id] };
    playlists[id] = {
      id, created: today(),
      title: TAPE.title,
      color: TAPE.color || "random",
      tracks: TAPE.tracks.map(t => ({ ...t })),
    };
  }
  const initialId = playlists[idx.active] ? idx.active : idx.ids[0];
  currentId = null;
  buildColorPicker();
  applyStrings();
  buildSortable();
  attachListeners();
  loadPlaylist(initialId);
  renderSelect();

  const savedKey = localStorage.getItem(YT_API_KEY_STORE);
  if (savedKey) document.getElementById('yt-api-key').value = savedKey;
}

// ── Helpers ──
function today() { return new Date().toISOString().split("T")[0]; }

// ── Playlist select ──
const selectEl = document.getElementById("playlist-select");

function renderSelect() {
  selectEl.innerHTML = "";
  idx.ids.forEach(id => {
    const p = playlists[id];
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = (id === idx.active ? "● " : "") + (p?.title || "untitled") + (p?.created ? ` — ${fmtDate(p.created)}` : "");
    selectEl.appendChild(opt);
  });
  selectEl.value = currentId;
  updateLiveBadge();
  document.getElementById("delete-btn").disabled = idx.ids.length <= 1;
}

function updateLiveBadge() {
  const live = currentId === idx.active;
  document.getElementById("live-badge").hidden = !live;
  document.getElementById("set-live-btn").hidden = live;
}

function updateLiveUI() {
  updateLiveBadge();
  selectEl.querySelectorAll("option").forEach(opt => {
    const id = opt.value;
    const p = playlists[id];
    opt.textContent = (id === idx.active ? "● " : "") + (p?.title || "untitled") + (p?.created ? ` — ${fmtDate(p.created)}` : "");
  });
}

function syncToPlaylists() {
  if (!currentId || !playlists[currentId]) return;
  playlists[currentId] = {
    ...playlists[currentId],
    title: state.title,
    color: state.color,
    tracks: state.tracks.map(t => ({ ...t })),
    location: state.location,
  };
}

function loadPlaylist(id) {
  hideUndo();
  syncToPlaylists();
  currentId = id;
  const p = playlists[id];
  if (!p) return;

  state.title = p.title;
  state.color = p.color;
  state.tracks = p.tracks.map(t => ({ ...t }));
  state.pendingId = null;
  state.location = p.location || null;

  document.getElementById("tape-name").value = state.title;
  applyColor(state.color);
  updateColorSwatches(state.color);
  renderTracks();

  document.getElementById("yt-input").value = "";
  document.getElementById("meta-row").hidden = true;
  setFetchStatus("");
  updateLiveBadge();
  updateLocationDisplay();
}

selectEl.addEventListener("change", () => loadPlaylist(selectEl.value));

// ── New ──
document.getElementById("new-btn").addEventListener("click", () => {
  const id = String(Date.now());
  playlists[id] = { id, created: today(), lastEdited: today(), title: T.newTape, color: "random", tracks: [] };
  idx.ids.push(id);
  loadPlaylist(id);
  renderSelect();
  const nameEl = document.getElementById("tape-name");
  nameEl.focus();
  nameEl.select();
});

// ── Delete ──
document.getElementById("delete-btn").addEventListener("click", async () => {
  if (idx.ids.length <= 1) return;
  const p = playlists[currentId];
  if (!confirm(T.delConfirm(p?.title || ''))) return;

  const btn = document.getElementById("save-btn");
  const status = document.getElementById("save-status");
  btn.disabled = true;
  status.className = "";
  status.textContent = T.saving;

  const idToDelete = currentId;
  idx.ids = idx.ids.filter(id => id !== idToDelete);
  delete playlists[idToDelete];
  if (idx.active === idToDelete) idx.active = idx.ids[0];
  currentId = idx.active;

  try {
    await deletePlaylistFile(idToDelete);
    await saveFiles([
      { path: 'playlists/index.json', content: JSON.stringify(idx, null, 2) },
      { path: 'config.js', content: buildConfig(playlists[idx.active]) },
    ], `delete playlist: ${p?.title || idToDelete}`);
    renderSelect();
    loadPlaylist(currentId);
    status.textContent = T.saved;
    setTimeout(() => { status.textContent = ""; }, 2500);
  } catch (err) {
    status.className = "error";
    status.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

// ── Set as live ──
document.getElementById("set-live-btn").addEventListener("click", async () => {
  syncToPlaylists();
  idx.active = currentId;
  updateLiveUI();
  await doSave();
});

// ── Color picker ──
let randomSwatch, prideSwatch, customSwatch, customInput;

function buildColorPicker() {
  const row = document.getElementById("color-row");

  randomSwatch = document.createElement("div");
  randomSwatch.className = "swatch swatch-random";
  randomSwatch.title = T.randomLbl;
  randomSwatch.textContent = "?";
  randomSwatch.addEventListener("click", () => setColor("random"));
  row.appendChild(randomSwatch);

  prideSwatch = document.createElement("div");
  prideSwatch.className = "swatch swatch-pride";
  prideSwatch.title = "pride";
  prideSwatch.addEventListener("click", () => setColor("pride"));
  row.appendChild(prideSwatch);

  PALETTE.forEach(hex => {
    const s = document.createElement("div");
    s.className = "swatch";
    s.style.background = hex;
    s.title = hex;
    s.addEventListener("click", () => setColor(hex));
    row.appendChild(s);
  });

  const wrap = document.createElement("div");
  wrap.id = "custom-color-wrap";

  customSwatch = document.createElement("div");
  customSwatch.id = "custom-color-swatch";
  customSwatch.title = T.customLbl;
  customSwatch.textContent = "+";

  customInput = document.createElement("input");
  customInput.type = "color";
  customInput.id = "custom-color";
  customInput.value = "#888888";
  customInput.addEventListener("input", () => {
    customSwatch.style.background = customInput.value;
    customSwatch.textContent = "";
    setColor(customInput.value, true);
  });

  wrap.append(customSwatch, customInput);
  row.appendChild(wrap);
}

function setColor(hex, fromCustom = false) {
  state.color = hex;
  applyColor(hex);
  updateColorSwatches(hex, fromCustom);
}

function applyColor(hex) {
  const resolved = hex === "random"
    ? PALETTE[Math.floor(Math.random() * PALETTE.length)]
    : hex === "pride" ? "#b33030" : hex;
  document.documentElement.style.setProperty("--bg", resolved);
  document.body.style.background = resolved;
}

function updateColorSwatches(color, fromCustom = false) {
  if (!randomSwatch) return;
  const isCustom = fromCustom || (!PALETTE.includes(color) && color !== "random" && color !== "pride");
  randomSwatch.classList.toggle("active", color === "random");
  prideSwatch.classList.toggle("active", color === "pride");
  document.querySelectorAll("#color-row .swatch:not(.swatch-random)").forEach(s => {
    s.classList.toggle("active", s.title === color);
  });
  customSwatch.classList.toggle("active", isCustom);
  if (isCustom && color !== "random") {
    customSwatch.style.background = color;
    customSwatch.textContent = "";
    customInput.value = color;
  } else if (!isCustom) {
    customSwatch.style.background = "";
    customSwatch.textContent = "+";
  }
}

// ── Tape name ──
document.getElementById("tape-name").addEventListener("input", e => {
  state.title = e.target.value;
  const opt = selectEl.querySelector(`option[value="${currentId}"]`);
  const p = playlists[currentId];
  if (opt) opt.textContent = state.title + (p?.created ? ` — ${fmtDate(p.created)}` : "");
});

// ── Track list ──
const trackList = document.getElementById("track-list");

function renderTracks() {
  trackList.innerHTML = "";
  document.getElementById("empty-state").hidden = state.tracks.length > 0;
  const atLimit = state.tracks.length >= 12;
  ytInput.disabled = atLimit;
  fetchBtn.disabled = atLimit;
  setFetchStatus(atLimit ? T.atLimit : "");

  state.tracks.forEach((track, i) => {
    const li = document.createElement("li");
    li.className = "track-item";
    li.dataset.track = JSON.stringify(track);

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "⠿";

    const num = document.createElement("span");
    num.className = "track-num";
    num.textContent = i + 1;

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "track-field track-title-field";
    titleInput.value = track.title;
    titleInput.placeholder = T.trackTitlePh;
    titleInput.spellcheck = false;
    titleInput.addEventListener("input", () => {
      track.title = titleInput.value;
      li.dataset.track = JSON.stringify(track);
    });

    const artistInput = document.createElement("input");
    artistInput.type = "text";
    artistInput.className = "track-field track-artist-field";
    artistInput.value = track.artist;
    artistInput.placeholder = T.artistPh;
    artistInput.spellcheck = false;
    artistInput.addEventListener("input", () => {
      track.artist = artistInput.value;
      li.dataset.track = JSON.stringify(track);
    });

    const del = document.createElement("button");
    del.className = "track-delete";
    del.textContent = "×";
    del.addEventListener("click", () => {
      const deletedTrack = { ...track };
      const deletedAt = i;
      state.tracks.splice(i, 1);
      renderTracks();
      showUndo(deletedTrack, deletedAt);
    });

    li.append(handle, num, titleInput, artistInput, del);
    trackList.appendChild(li);
  });
}

function buildSortable() {
  Sortable.create(trackList, {
    handle: ".drag-handle",
    animation: 120,
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    onEnd() {
      state.tracks = [...trackList.querySelectorAll(".track-item")]
        .map(el => JSON.parse(el.dataset.track));
      renderTracks();
    }
  });
}

// ── Add track ──
const ytInput = document.getElementById("yt-input");
const fetchBtn = document.getElementById("fetch-btn");
const metaRow = document.getElementById("meta-row");
const metaTitle = document.getElementById("meta-title");
const metaArtist = document.getElementById("meta-artist");
const addBtn = document.getElementById("add-btn");

async function doFetch() {
  const id = extractId(ytInput.value);
  if (!id) {
    if (extractPlaylistId(ytInput.value)) { updateImportRow(); return; }
    setFetchStatus(T.noId, true);
    return;
  }
  fetchBtn.disabled = true;
  setFetchStatus(T.fetching);
  metaRow.hidden = true;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    if (!res.ok) throw new Error(T.videoUnavail);
    const data = await res.json();
    state.pendingId = id;
    metaTitle.value = data.title;
    metaArtist.value = data.author_name;
    metaRow.hidden = false;
    metaTitle.focus();
    setFetchStatus("");
  } catch (err) {
    setFetchStatus(err.message, true);
  } finally {
    fetchBtn.disabled = false;
  }
}

addBtn.addEventListener("click", () => {
  if (!state.pendingId || !metaTitle.value.trim()) return;
  if (state.tracks.length >= 12) { setFetchStatus(T.atLimitFull, true); return; }
  state.tracks.push({ id: state.pendingId, title: metaTitle.value.trim(), artist: metaArtist.value.trim() });
  renderTracks();
  ytInput.value = ""; metaTitle.value = ""; metaArtist.value = "";
  metaRow.hidden = true; state.pendingId = null;
  setFetchStatus(""); ytInput.focus();
});

function setFetchStatus(msg, isError = false) {
  const el = document.getElementById("fetch-status");
  el.textContent = msg;
  el.className = isError ? "error" : "";
}

function setImportStatus(msg, isError = false) {
  const el = document.getElementById('import-status');
  el.textContent = msg;
  el.className = isError ? 'error' : '';
}

function updateImportRow() {
  const listId = extractPlaylistId(ytInput.value);
  const importRow = document.getElementById('import-row');
  if (!listId) { importRow.hidden = true; return; }
  importRow.hidden = false;
  const apiKey = document.getElementById('yt-api-key').value.trim() || localStorage.getItem(YT_API_KEY_STORE) || '';
  const importBtn = document.getElementById('import-btn');
  importBtn.disabled = !apiKey;
  setImportStatus(apiKey ? '' : T.importNoKey);
}

async function doImport() {
  const listId = extractPlaylistId(ytInput.value);
  if (!listId) return;
  const apiKey = (document.getElementById('yt-api-key').value.trim() || localStorage.getItem(YT_API_KEY_STORE) || '').trim();
  if (!apiKey) { setImportStatus(T.importNoKey, true); return; }
  const remaining = 12 - state.tracks.length;
  if (remaining <= 0) { setImportStatus(T.atLimitFull, true); return; }
  const importBtn = document.getElementById('import-btn');
  importBtn.disabled = true;
  setImportStatus(T.importing);
  try {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=${remaining}&playlistId=${encodeURIComponent(listId)}&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || T.importFailed);
    const items = (data.items || []).filter(item => {
      const vid = item.snippet?.resourceId?.videoId;
      const title = item.snippet?.title;
      return vid && title && title !== 'Private video' && title !== 'Deleted video';
    });
    if (!items.length) { setImportStatus(T.importNone); return; }
    items.forEach(item => {
      if (state.tracks.length >= 12) return;
      state.tracks.push({ id: item.snippet.resourceId.videoId, title: item.snippet.title, artist: item.snippet.videoOwnerChannelTitle || '' });
    });
    renderTracks();
    setImportStatus(T.importAdded(items.length));
    ytInput.value = '';
    document.getElementById('import-row').hidden = true;
  } catch (err) {
    setImportStatus(err.message || T.importFailed, true);
  } finally {
    importBtn.disabled = false;
  }
}

// ── i18n ──
function applyStrings() {
  document.getElementById('new-btn').textContent = T.newBtn;
  document.getElementById('delete-btn').textContent = T.delBtn;
  document.getElementById('live-badge').textContent = T.liveBadge;
  document.getElementById('set-live-btn').textContent = T.setLiveBtn;
  document.getElementById('tape-name').placeholder = T.titlePh;
  document.querySelector('#tracks-section .section-label').textContent = T.tracksLbl;
  document.getElementById('empty-state').textContent = T.empty;
  document.querySelector('#add-section .section-label').textContent = T.addTrackLbl;
  document.getElementById('yt-input').placeholder = T.urlPh;
  document.getElementById('fetch-btn').textContent = T.fetchBtn;
  document.getElementById('meta-title').placeholder = T.trackTitlePh;
  document.getElementById('meta-artist').placeholder = T.artistPh;
  document.getElementById('add-btn').textContent = T.addBtn;
  document.getElementById('save-btn').textContent = T.saveBtn;
  document.getElementById('view-link').textContent = T.viewLink;
  document.getElementById('location-btn').textContent = T.setLocBtn;
  document.getElementById('import-btn').textContent = T.importBtn;
  document.getElementById('undo-btn').textContent = T.undoBtn;
}

// ── Save ──
document.getElementById("save-btn").addEventListener("click", async () => {
  syncToPlaylists();
  await doSave();
});

async function doSave() {
  const btn = document.getElementById("save-btn");
  const status = document.getElementById("save-status");
  btn.disabled = true;
  status.className = "";
  status.textContent = T.saving;
  if (playlists[currentId]) playlists[currentId].lastEdited = today();

  try {
    const files = buildSaveFiles(currentId, playlists, idx);
    await saveFiles(files, `update: ${playlists[currentId]?.title || currentId}`);
    status.textContent = T.saved;
    setTimeout(() => { status.textContent = ""; }, 2500);
  } catch (err) {
    status.className = "error";
    status.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

// ── Location ──
function updateLocationDisplay() {
  const el = document.getElementById('location-display');
  if (!state.location) { el.textContent = ''; return; }
  el.textContent = state.location.city || `${state.location.lat.toFixed(3)}, ${state.location.lng.toFixed(3)}`;
}

document.getElementById('location-btn').addEventListener('click', async () => {
  const btn = document.getElementById('location-btn');
  const display = document.getElementById('location-display');
  if (!navigator.geolocation) { display.textContent = 'not supported'; return; }
  btn.disabled = true;
  display.textContent = T.locating;
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
    );
    const { latitude: rawLat, longitude: rawLng } = pos.coords;
    let city = null;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${rawLat}&lon=${rawLng}&format=json`);
      const d = await r.json();
      city = d.address?.city || d.address?.town || d.address?.village || d.address?.county || null;
    } catch {}
    const { lat, lng } = fuzzyCoord(rawLat, rawLng);
    state.location = { city, lat, lng };
    updateLocationDisplay();
  } catch (err) {
    display.textContent = err?.code === 1 ? T.locBlocked : T.locUnavail;
  } finally {
    btn.disabled = false;
  }
});

// ── Misc listeners ──
function attachListeners() {
  fetchBtn.addEventListener("click", doFetch);
  ytInput.addEventListener("keydown", e => { if (e.key === "Enter") doFetch(); });
  ytInput.addEventListener("input", updateImportRow);
  metaArtist.addEventListener("keydown", e => { if (e.key === "Enter") addBtn.click(); });

  document.getElementById('undo-btn').addEventListener('click', () => {
    if (!undoState) return;
    state.tracks.splice(undoState.index, 0, undoState.track);
    hideUndo();
    renderTracks();
  });

  document.getElementById('import-btn').addEventListener('click', doImport);

  document.getElementById('yt-api-key').addEventListener('input', e => {
    const val = e.target.value.trim();
    if (val) localStorage.setItem(YT_API_KEY_STORE, val);
    else localStorage.removeItem(YT_API_KEY_STORE);
    updateImportRow();
  });
}

// ── Bootstrap ──
(async () => {
  await checkAuth();
  await init();
})();
