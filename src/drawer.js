// Library drawer: published tapes as cassette spines in a left flyout,
// opened from the ≣ button beside the tape title. DOM only — ordering and
// spine-color decisions live in library.js, tape switching in main.js.
import { L } from './strings.js';
import { PALETTE } from './utils.js';
import { validateIndex, validatePlaylist } from './schema.js';
import { drawerEntries, drawerEligible, spineColor, spineTextColor } from './library.js';

export function initDrawer({ bakedTape, getCurrentTapeId, onSelect }) {
  const head = document.getElementById('tape-head');
  if (!head) return null; // embed has no header — no drawer

  const btn = document.createElement('button');
  btn.id = 'library-btn';
  btn.textContent = '≣';
  btn.setAttribute('aria-label', L.lb);
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'library-drawer');
  // The button hugs the left edge — the side the drawer slides out from.
  // Its slot is reserved in CSS (visibility, not display) so the title's
  // position never depends on whether a library exists.
  head.prepend(btn);

  const drawer = document.createElement('div');
  drawer.id = 'library-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-label', L.lb);
  drawer.setAttribute('aria-hidden', 'true');
  const shelf = document.createElement('ul');
  shelf.id = 'library-shelf';
  drawer.appendChild(shelf);
  const scrim = document.createElement('div');
  scrim.id = 'library-scrim';
  document.body.append(drawer, scrim); // adjacent siblings — the scrim CSS relies on it

  let entryIds = [];
  const tapes = new Map([[bakedTape.id, bakedTape]]); // the baked tape needs no fetch
  let shelfLoaded = false;
  let isOpen = false;

  // Reveal the button only when more than one tape is published; a missing
  // or invalid index just leaves the slot invisible.
  (window.requestIdleCallback || (fn => setTimeout(fn, 0)))(async () => {
    try {
      const res = await fetch('/playlists/index.json');
      if (!res.ok) return;
      const index = await res.json();
      validateIndex(index);
      entryIds = drawerEntries(index, bakedTape.id);
      if (drawerEligible(index)) btn.style.visibility = 'visible';
    } catch {}
  });

  // First open: fetch the published tapes in parallel; a tape that fails to
  // fetch or validate just doesn't make the shelf.
  async function loadShelf() {
    if (shelfLoaded) return;
    shelfLoaded = true;
    await Promise.all(entryIds.map(async id => {
      if (tapes.has(id)) return;
      try {
        const res = await fetch(`/playlists/${encodeURIComponent(id)}.json`);
        if (!res.ok) return;
        const pl = await res.json();
        validatePlaylist(pl);
        if (!pl.id) pl.id = id;
        tapes.set(id, pl);
      } catch {}
    }));
    renderShelf();
  }

  function renderShelf() {
    shelf.replaceChildren();
    entryIds.forEach(id => {
      const pl = tapes.get(id);
      if (!pl) return;
      const li = document.createElement('li');
      const spine = document.createElement('button');
      spine.className = 'spine';
      spine.dataset.id = id;
      const color = spineColor(pl.color, id, PALETTE);
      if (color === 'pride') {
        spine.classList.add('spine-pride');
      } else {
        spine.style.setProperty('--spine', color);
        spine.dataset.text = spineTextColor(color);
      }
      const title = document.createElement('span');
      title.className = 'spine-title';
      title.textContent = pl.title || 'untitled';
      const count = document.createElement('span');
      count.className = 'spine-count';
      count.textContent = L.tr(pl.tracks.length);
      spine.append(title, count);
      spine.addEventListener('click', () => {
        if (id !== getCurrentTapeId()) onSelect(id);
        close();
      });
      li.appendChild(spine);
      shelf.appendChild(li);
    });
    markActive(getCurrentTapeId());
  }

  function markActive(id) {
    shelf.querySelectorAll('.spine').forEach(s => {
      const active = s.dataset.id === id;
      s.classList.toggle('spine-active', active);
      if (active) s.setAttribute('aria-current', 'true');
      else s.removeAttribute('aria-current');
    });
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    loadShelf();
    markActive(getCurrentTapeId());
    drawer.classList.add('drawer-open');
    drawer.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-expanded', 'true');
    drawer.querySelector('.spine-active')?.focus({ preventScroll: true });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    drawer.classList.remove('drawer-open');
    drawer.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.focus({ preventScroll: true });
  }

  btn.addEventListener('click', () => (isOpen ? close() : open()));
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen) close();
  });

  return { markActive, close, isOpen: () => isOpen };
}
