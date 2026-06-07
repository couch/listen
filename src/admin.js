import './admin.css';
import Sortable from 'sortablejs';

const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const GH_DEFAULTS = { owner: 'couch', repo: 'listen', branch: 'main' };

const PALETTE = [
  "#a83232","#c1440e","#9c6b1a","#4a7a2e","#2e7a6e",
  "#2e4a7a","#5c2e7a","#7a2e5c","#4a5f6e","#7a6b2e"
];

const TRANSLATIONS = {
  en: { mo:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], newBtn:'+ New', delBtn:'Delete', liveBadge:'● live', setLiveBtn:'Set as live', tracksLbl:'tracks', addTrackLbl:'add track', fetchBtn:'Fetch →', addBtn:'Add', saveBtn:'Save', viewLink:'View tape →', titlePh:'tape title', urlPh:'YouTube URL or video ID', trackTitlePh:'Title', artistPh:'Artist', saving:'Saving…', saved:'Saved ✓', fetching:'Fetching…', setLocBtn:'Set location', locating:'locating…', locBlocked:'blocked — allow location in browser settings', locUnavail:'location unavailable', empty:'No tracks yet — add one below.', atLimit:'12 track limit reached.', atLimitFull:'Playlists are limited to 12 tracks.', noId:"Couldn't find a YouTube video ID.", videoUnavail:'Video not found or unavailable.', randomLbl:'random each load', customLbl:'custom color', newTape:'new tape', delConfirm:t=>`Delete "${t}"? This cannot be undone.` },
  es: { mo:['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'], newBtn:'+ Nueva', delBtn:'Eliminar', liveBadge:'● en vivo', setLiveBtn:'Marcar como activa', tracksLbl:'pistas', addTrackLbl:'añadir pista', fetchBtn:'Buscar →', addBtn:'Añadir', saveBtn:'Guardar', viewLink:'Ver cinta →', titlePh:'título de la cinta', urlPh:'URL de YouTube o ID de video', trackTitlePh:'Título', artistPh:'Artista', saving:'Guardando…', saved:'Guardado ✓', fetching:'Buscando…', setLocBtn:'Establecer ubicación', locating:'localizando…', locBlocked:'bloqueado — permite la ubicación en ajustes del navegador', locUnavail:'ubicación no disponible', empty:'Sin pistas aún — añade una abajo.', atLimit:'Límite de 12 pistas alcanzado.', atLimitFull:'Las listas están limitadas a 12 pistas.', noId:'No se encontró un ID de video de YouTube.', videoUnavail:'Video no encontrado o no disponible.', randomLbl:'aleatoria en cada carga', customLbl:'color personalizado', newTape:'nueva cinta', delConfirm:t=>`¿Eliminar "${t}"? Esta acción no se puede deshacer.` },
  it: { mo:['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'], newBtn:'+ Nuova', delBtn:'Elimina', liveBadge:'● live', setLiveBtn:'Imposta come attiva', tracksLbl:'brani', addTrackLbl:'aggiungi brano', fetchBtn:'Cerca →', addBtn:'Aggiungi', saveBtn:'Salva', viewLink:'Visualizza →', titlePh:'titolo del nastro', urlPh:'URL YouTube o ID video', trackTitlePh:'Titolo', artistPh:'Artista', saving:'Salvataggio…', saved:'Salvato ✓', fetching:'Ricerca…', setLocBtn:'Imposta posizione', locating:'localizzando…', locBlocked:'bloccato — consenti la posizione nelle impostazioni del browser', locUnavail:'posizione non disponibile', empty:'Nessun brano ancora — aggiungine uno sotto.', atLimit:'Limite di 12 brani raggiunto.', atLimitFull:'Le playlist sono limitate a 12 brani.', noId:'ID video YouTube non trovato.', videoUnavail:'Video non trovato o non disponibile.', randomLbl:'casuale ad ogni caricamento', customLbl:'colore personalizzato', newTape:'nuovo nastro', delConfirm:t=>`Eliminare "${t}"? Questa azione non può essere annullata.` },
  de: { mo:['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'], newBtn:'+ Neu', delBtn:'Löschen', liveBadge:'● aktiv', setLiveBtn:'Als aktiv setzen', tracksLbl:'Titel', addTrackLbl:'Titel hinzufügen', fetchBtn:'Abrufen →', addBtn:'Hinzufügen', saveBtn:'Speichern', viewLink:'Ansehen →', titlePh:'Kassettenname', urlPh:'YouTube-URL oder Video-ID', trackTitlePh:'Titel', artistPh:'Künstler', saving:'Speichern…', saved:'Gespeichert ✓', fetching:'Abrufen…', setLocBtn:'Standort setzen', locating:'Standort wird ermittelt…', locBlocked:'Blockiert — Standort in Browsereinstellungen erlauben', locUnavail:'Standort nicht verfügbar', empty:'Noch keine Titel — füge unten einen hinzu.', atLimit:'Limit von 12 Titeln erreicht.', atLimitFull:'Playlists sind auf 12 Titel begrenzt.', noId:'Keine YouTube-Video-ID gefunden.', videoUnavail:'Video nicht gefunden oder nicht verfügbar.', randomLbl:'zufällig bei jedem Laden', customLbl:'benutzerdefinierte Farbe', newTape:'neues Band', delConfirm:t=>`"${t}" löschen? Dies kann nicht rückgängig gemacht werden.` },
  fr: { mo:['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'], newBtn:'+ Nouveau', delBtn:'Supprimer', liveBadge:'● en direct', setLiveBtn:'Définir comme active', tracksLbl:'titres', addTrackLbl:'ajouter un titre', fetchBtn:'Récupérer →', addBtn:'Ajouter', saveBtn:'Enregistrer', viewLink:'Voir →', titlePh:'titre de la cassette', urlPh:'URL YouTube ou ID de vidéo', trackTitlePh:'Titre', artistPh:'Artiste', saving:'Enregistrement…', saved:'Enregistré ✓', fetching:'Récupération…', setLocBtn:'Définir la position', locating:'localisation…', locBlocked:'bloqué — autorise la position dans les paramètres du navigateur', locUnavail:'position non disponible', empty:"Pas encore de titres — ajoutez-en un ci-dessous.", atLimit:'Limite de 12 titres atteinte.', atLimitFull:'Les listes sont limitées à 12 titres.', noId:"Impossible de trouver un ID de vidéo YouTube.", videoUnavail:'Vidéo introuvable ou non disponible.', randomLbl:'aléatoire à chaque chargement', customLbl:'couleur personnalisée', newTape:'nouvelle cassette', delConfirm:t=>`Supprimer "${t}" ? Cette action est irréversible.` },
  zh: { mo:['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'], newBtn:'+ 新建', delBtn:'删除', liveBadge:'● 当前', setLiveBtn:'设为当前', tracksLbl:'曲目', addTrackLbl:'添加曲目', fetchBtn:'获取 →', addBtn:'添加', saveBtn:'保存', viewLink:'查看 →', titlePh:'播放列表标题', urlPh:'YouTube 链接或视频 ID', trackTitlePh:'标题', artistPh:'艺术家', saving:'保存中…', saved:'已保存 ✓', fetching:'获取中…', setLocBtn:'设置位置', locating:'正在定位…', locBlocked:'已屏蔽 — 请在浏览器设置中允许位置访问', locUnavail:'位置不可用', empty:'暂无曲目 — 请在下方添加。', atLimit:'已达 12 首上限。', atLimitFull:'播放列表最多 12 首曲目。', noId:'未找到 YouTube 视频 ID。', videoUnavail:'视频未找到或不可用。', randomLbl:'每次加载随机', customLbl:'自定义颜色', newTape:'新播放列表', delConfirm:t=>`删除"${t}"？此操作无法撤销。` },
  ko: { mo:['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'], newBtn:'+ 새로', delBtn:'삭제', liveBadge:'● 라이브', setLiveBtn:'활성으로 설정', tracksLbl:'트랙', addTrackLbl:'트랙 추가', fetchBtn:'가져오기 →', addBtn:'추가', saveBtn:'저장', viewLink:'보기 →', titlePh:'테이프 제목', urlPh:'YouTube URL 또는 동영상 ID', trackTitlePh:'제목', artistPh:'아티스트', saving:'저장 중…', saved:'저장됨 ✓', fetching:'가져오는 중…', setLocBtn:'위치 설정', locating:'위치 확인 중…', locBlocked:'차단됨 — 브라우저 설정에서 위치 접근 허용', locUnavail:'위치를 사용할 수 없음', empty:'아직 트랙 없음 — 아래에서 추가하세요.', atLimit:'12곡 제한에 도달했습니다.', atLimitFull:'재생목록은 최대 12곡입니다.', noId:'YouTube 동영상 ID를 찾을 수 없습니다.', videoUnavail:'동영상을 찾을 수 없거나 사용할 수 없습니다.', randomLbl:'매번 임의 선택', customLbl:'사용자 정의 색상', newTape:'새 테이프', delConfirm:t=>`"${t}"을(를) 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.` },
  ja: { mo:['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'], newBtn:'+ 新規', delBtn:'削除', liveBadge:'● ライブ', setLiveBtn:'ライブに設定', tracksLbl:'トラック', addTrackLbl:'トラックを追加', fetchBtn:'取得 →', addBtn:'追加', saveBtn:'保存', viewLink:'確認 →', titlePh:'テープのタイトル', urlPh:'YouTube URL または動画 ID', trackTitlePh:'タイトル', artistPh:'アーティスト', saving:'保存中…', saved:'保存済み ✓', fetching:'取得中…', setLocBtn:'位置を設定', locating:'位置情報を取得中…', locBlocked:'ブロックされています — ブラウザ設定で位置情報を許可してください', locUnavail:'位置情報を利用できません', empty:'トラックがありません — 下から追加してください。', atLimit:'12曲の上限に達しました。', atLimitFull:'プレイリストは最大12曲です。', noId:'YouTube の動画 ID が見つかりませんでした。', videoUnavail:'動画が見つからないか利用できません。', randomLbl:'毎回ランダム', customLbl:'カスタムカラー', newTape:'新しいテープ', delConfirm:t=>`"${t}" を削除しますか？この操作は元に戻せません。` },
  ru: { mo:['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'], newBtn:'+ Новый', delBtn:'Удалить', liveBadge:'● в эфире', setLiveBtn:'Сделать активным', tracksLbl:'треки', addTrackLbl:'добавить трек', fetchBtn:'Загрузить →', addBtn:'Добавить', saveBtn:'Сохранить', viewLink:'Просмотр →', titlePh:'название ленты', urlPh:'URL YouTube или ID видео', trackTitlePh:'Название', artistPh:'Исполнитель', saving:'Сохранение…', saved:'Сохранено ✓', fetching:'Загрузка…', setLocBtn:'Установить местоположение', locating:'определение местоположения…', locBlocked:'заблокировано — разрешите доступ к местоположению в настройках браузера', locUnavail:'местоположение недоступно', empty:'Треков пока нет — добавьте ниже.', atLimit:'Достигнут лимит 12 треков.', atLimitFull:'Плейлисты ограничены 12 треками.', noId:'Не удалось найти ID видео YouTube.', videoUnavail:'Видео не найдено или недоступно.', randomLbl:'случайный при каждой загрузке', customLbl:'произвольный цвет', newTape:'новая лента', delConfirm:t=>`Удалить "${t}"? Это действие нельзя отменить.` },
  hi: { mo:['जन','फ़र','मार','अप्र','मई','जून','जुल','अग','सित','अक्टू','नव','दिस'], newBtn:'+ नया', delBtn:'हटाएं', liveBadge:'● लाइव', setLiveBtn:'लाइव सेट करें', tracksLbl:'ट्रैक', addTrackLbl:'ट्रैक जोड़ें', fetchBtn:'लाएं →', addBtn:'जोड़ें', saveBtn:'सहेजें', viewLink:'देखें →', titlePh:'टेप शीर्षक', urlPh:'YouTube URL या वीडियो ID', trackTitlePh:'शीर्षक', artistPh:'कलाकार', saving:'सहेज रहे हैं…', saved:'सहेजा ✓', fetching:'लाया जा रहा है…', setLocBtn:'स्थान सेट करें', locating:'स्थान खोजा जा रहा है…', locBlocked:'अवरुद्ध — ब्राउज़र सेटिंग में स्थान की अनुमति दें', locUnavail:'स्थान उपलब्ध नहीं', empty:'अभी कोई ट्रैक नहीं — नीचे जोड़ें।', atLimit:'12 ट्रैक की सीमा पूरी हुई।', atLimitFull:'प्लेलिस्ट में अधिकतम 12 ट्रैक हो सकते हैं।', noId:'YouTube वीडियो ID नहीं मिली।', videoUnavail:'वीडियो नहीं मिला या उपलब्ध नहीं है।', randomLbl:'हर बार यादृच्छिक', customLbl:'कस्टम रंग', newTape:'नया टेप', delConfirm:t=>`"${t}" हटाएं? यह क्रिया पूर्ववत नहीं की जा सकती।` },
  mr: { mo:['जाने','फेब्रु','मार्च','एप्रि','मे','जून','जुलै','ऑग','सप्टें','ऑक्टो','नोव्हें','डिसें'], newBtn:'+ नवीन', delBtn:'हटवा', liveBadge:'● लाइव्ह', setLiveBtn:'लाइव्ह सेट करा', tracksLbl:'ट्रॅक', addTrackLbl:'ट्रॅक जोडा', fetchBtn:'आणा →', addBtn:'जोडा', saveBtn:'जतन करा', viewLink:'पहा →', titlePh:'टेप शीर्षक', urlPh:'YouTube URL किंवा व्हिडिओ ID', trackTitlePh:'शीर्षक', artistPh:'कलाकार', saving:'जतन करत आहे…', saved:'जतन केले ✓', fetching:'आणत आहे…', setLocBtn:'स्थान सेट करा', locating:'स्थान शोधत आहे…', locBlocked:'अवरोधित — ब्राउझर सेटिंगमध्ये स्थानाला परवानगी द्या', locUnavail:'स्थान उपलब्ध नाही', empty:'अजून ट्रॅक नाहीत — खाली जोडा.', atLimit:'12 ट्रॅकची मर्यादा पूर्ण झाली.', atLimitFull:'प्लेलिस्टमध्ये जास्तीत जास्त 12 ट्रॅक असू शकतात.', noId:'YouTube व्हिडिओ ID सापडली नाही.', videoUnavail:'व्हिडिओ सापडला नाही किंवा उपलब्ध नाही.', randomLbl:'प्रत्येक वेळी यादृच्छिक', customLbl:'सानुकूल रंग', newTape:'नवीन टेप', delConfirm:t=>`"${t}" हटवायचे? ही क्रिया पूर्ववत करता येणार नाही.` },
};
const lang = (navigator.language || 'en').split('-')[0].toLowerCase();
const T = TRANSLATIONS[lang] || TRANSLATIONS.en;

// ── Auth ──

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getGHConfig() {
  try { return { ...GH_DEFAULTS, ...JSON.parse(localStorage.getItem('muxtape-gh-config') || '{}') }; }
  catch { return { ...GH_DEFAULTS }; }
}

async function checkAuth() {
  if (IS_LOCAL) return;

  const storedHash = localStorage.getItem('muxtape-admin-hash');
  const isSetup = !storedHash;
  const gh = getGHConfig();

  await new Promise(resolve => {
    const gate = document.createElement('div');
    gate.id = 'auth-gate';
    gate.innerHTML = isSetup ? `
      <div id="auth-box">
        <h2>edit tape</h2>
        <p class="auth-hint">First-time setup</p>
        <input type="password" id="auth-pw" placeholder="set a password" autocomplete="new-password">
        <input type="password" id="auth-confirm" placeholder="confirm password" autocomplete="new-password">
        <input type="text" id="auth-token" placeholder="GitHub token (contents: write)" autocomplete="off" spellcheck="false">
        <details id="auth-advanced">
          <summary>GitHub repo</summary>
          <input type="text" id="auth-owner" value="${gh.owner}" placeholder="owner">
          <input type="text" id="auth-repo-name" value="${gh.repo}" placeholder="repo">
          <input type="text" id="auth-branch" value="${gh.branch}" placeholder="branch">
        </details>
        <button id="auth-submit">Set up</button>
        <p id="auth-error"></p>
      </div>
    ` : `
      <div id="auth-box">
        <h2>edit tape</h2>
        <input type="password" id="auth-pw" placeholder="password" autocomplete="current-password">
        <button id="auth-submit">Enter</button>
        <p id="auth-error"></p>
        <button id="auth-reset">Reset credentials</button>
      </div>
    `;

    document.body.prepend(gate);
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
        localStorage.setItem('muxtape-admin-hash', await sha256(pw));
        localStorage.setItem('muxtape-gh-token', token);
        localStorage.setItem('muxtape-gh-config', JSON.stringify({
          owner: document.getElementById('auth-owner').value.trim() || GH_DEFAULTS.owner,
          repo: document.getElementById('auth-repo-name').value.trim() || GH_DEFAULTS.repo,
          branch: document.getElementById('auth-branch').value.trim() || GH_DEFAULTS.branch,
        }));
        gate.remove();
        resolve();
      } else {
        if (await sha256(pw) === storedHash) {
          gate.remove();
          resolve();
        } else {
          errorEl.textContent = 'Incorrect password';
          document.getElementById('auth-pw').value = '';
          document.getElementById('auth-pw').focus();
        }
      }
    });

    document.getElementById('auth-pw').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('auth-submit').click();
    });

    if (!isSetup) {
      document.getElementById('auth-reset').addEventListener('click', () => {
        if (!confirm('Clear admin credentials and start over?')) return;
        ['muxtape-admin-hash', 'muxtape-gh-token', 'muxtape-gh-config'].forEach(k => localStorage.removeItem(k));
        location.reload();
      });
    }
  });
}

// ── GitHub API ──

async function githubCommit(files, message) {
  const token = localStorage.getItem('muxtape-gh-token');
  const gh = getGHConfig();
  const base = `https://api.github.com/repos/${gh.owner}/${gh.repo}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };

  const refRes = await fetch(`${base}/git/refs/heads/${gh.branch}`, { headers });
  if (!refRes.ok) {
    const e = await refRes.json().catch(() => ({}));
    throw new Error(e.message || `GitHub ${refRes.status} — check token and repo settings`);
  }
  const latestSha = (await refRes.json()).object.sha;
  const { tree: { sha: treeSha } } = await fetch(`${base}/git/commits/${latestSha}`, { headers }).then(r => r.json());

  const treeItems = await Promise.all(files.map(async ({ path, content }) => {
    const { sha } = await fetch(`${base}/git/blobs`, {
      method: 'POST', headers,
      body: JSON.stringify({ content, encoding: 'utf-8' }),
    }).then(r => r.json());
    return { path, mode: '100644', type: 'blob', sha };
  }));

  const { sha: newTreeSha } = await fetch(`${base}/git/trees`, {
    method: 'POST', headers,
    body: JSON.stringify({ base_tree: treeSha, tree: treeItems }),
  }).then(r => r.json());

  const { sha: newCommitSha } = await fetch(`${base}/git/commits`, {
    method: 'POST', headers,
    body: JSON.stringify({ message, tree: newTreeSha, parents: [latestSha] }),
  }).then(r => r.json());

  const patchRes = await fetch(`${base}/git/refs/heads/${gh.branch}`, {
    method: 'PATCH', headers,
    body: JSON.stringify({ sha: newCommitSha }),
  });
  if (!patchRes.ok) throw new Error('Failed to update branch ref');
}

async function githubDeleteFile(filePath, message) {
  const token = localStorage.getItem('muxtape-gh-token');
  const gh = getGHConfig();
  const url = `https://api.github.com/repos/${gh.owner}/${gh.repo}/contents/${filePath}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
  const getRes = await fetch(`${url}?ref=${gh.branch}`, { headers });
  if (!getRes.ok) return;
  const { sha } = await getRes.json();
  await fetch(url, { method: 'DELETE', headers, body: JSON.stringify({ message, sha, branch: gh.branch }) });
}

// ── Save dispatch ──

async function saveFiles(files, message) {
  if (IS_LOCAL) {
    for (const { path, content } of files) await localPost(path, content);
  } else {
    await githubCommit(files, message);
  }
}

async function deletePlaylistFile(id) {
  if (IS_LOCAL) {
    const res = await fetch('/delete-playlist', { method: 'POST', body: JSON.stringify({ id }) });
    if (!res.ok) throw new Error(`/delete-playlist failed (${res.status})`);
  } else {
    await githubDeleteFile(`playlists/${id}.json`, `delete playlist ${id}`);
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

// ── Init ──
async function init() {
  try {
    const res = await fetch("/playlists/index.json");
    if (!res.ok) throw new Error();
    idx = await res.json();
    await Promise.all(idx.ids.map(async id => {
      const r = await fetch(`/playlists/${id}.json`);
      if (r.ok) {
        const pl = await r.json();
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
}

// ── Helpers ──
function today() { return new Date().toISOString().split("T")[0]; }

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const dd = String(+d).padStart(2, '0');
  if (lang === 'zh' || lang === 'ja') return `${y}年${+m}月${dd}日`;
  if (lang === 'ko') return `${y}년 ${+m}월 ${dd}일`;
  return `${dd} ${T.mo[+m - 1]} ${y}`;
}

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
  updateLiveUI();
  document.getElementById("delete-btn").disabled = idx.ids.length <= 1;
}

function updateLiveUI() {
  const live = currentId === idx.active;
  document.getElementById("live-badge").hidden = !live;
  document.getElementById("set-live-btn").hidden = live;
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
  updateLiveUI();
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
      { path: 'config.js', content: buildConfig() },
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
    del.addEventListener("click", () => { state.tracks.splice(i, 1); renderTracks(); });

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

function extractId(raw) {
  raw = raw.trim();
  let m;
  if ((m = raw.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/))) return m[1];
  if ((m = raw.match(/[?&]v=([a-zA-Z0-9_-]{11})/))) return m[1];
  if ((m = raw.match(/embed\/([a-zA-Z0-9_-]{11})/))) return m[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  return null;
}

async function doFetch() {
  const id = extractId(ytInput.value);
  if (!id) { setFetchStatus(T.noId, true); return; }
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
}

// ── Save ──
function buildConfig() {
  const p = playlists[idx.active];
  if (!p) return "";
  let extra = '';
  if (p.created) extra += `\n  created: ${JSON.stringify(p.created)},`;
  if (p.lastEdited) extra += `\n  lastEdited: ${JSON.stringify(p.lastEdited)},`;
  if (p.location) extra += `\n  location: ${JSON.stringify(p.location)},`;
  const lines = p.tracks
    .map(t => `    { id: ${JSON.stringify(t.id)}, title: ${JSON.stringify(t.title)}, artist: ${JSON.stringify(t.artist)} }`)
    .join(",\n");
  return `const TAPE = {\n  title: ${JSON.stringify(p.title)},\n\n  // A hex color like "#c1440e", "random" to pick each load, or "pride" for rainbow\n  color: ${JSON.stringify(p.color)},${extra}\n\n  tracks: [\n${lines},\n  ]\n};\n`;
}

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
    const files = [
      { path: `playlists/${currentId}.json`, content: JSON.stringify(playlists[currentId], null, 2) },
    ];
    if (idx.active !== currentId && playlists[idx.active]) {
      files.push({ path: `playlists/${idx.active}.json`, content: JSON.stringify(playlists[idx.active], null, 2) });
    }
    files.push({ path: 'playlists/index.json', content: JSON.stringify(idx, null, 2) });
    files.push({ path: 'config.js', content: buildConfig() });

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
function fuzzyCoord(lat, lng) {
  const dist = Math.sqrt(Math.random()) / 69; // uniform within ~1 mile radius
  const angle = Math.random() * 2 * Math.PI;
  return {
    lat: +(lat + dist * Math.cos(angle)).toFixed(3),
    lng: +(lng + dist * Math.sin(angle) / Math.cos(lat * Math.PI / 180)).toFixed(3),
  };
}

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
  metaArtist.addEventListener("keydown", e => { if (e.key === "Enter") addBtn.click(); });
}

// ── Bootstrap ──
(async () => {
  await checkAuth();
  await init();
})();
