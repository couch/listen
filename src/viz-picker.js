// Visualization picker — a quiet control in the overlay's lower-right
// corner. On hover-capable pointers the whole thing stays invisible until
// the mouse enters the bottom quarter of the screen (visualizer.js drives
// that via the `picker-reveal` class); on touch screens a faint toggle is
// always present and tapping it opens the menu, which hides itself after
// a few idle seconds or on an outside tap. DOM only — selection state and
// persistence live in visualizer.js.

const MENU_IDLE_MS = 6000;

export function createVizPicker({ entries, activeId, onSelect, onReveal, groupLabel }) {
  const root = document.createElement('div');
  root.id = 'viz-picker';

  const toggle = document.createElement('button');
  toggle.id = 'viz-picker-toggle';
  toggle.setAttribute('aria-label', groupLabel);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-haspopup', 'true');
  toggle.textContent = '⁘';

  const menu = document.createElement('div');
  menu.id = 'viz-picker-menu';
  menu.setAttribute('role', 'radiogroup');
  menu.setAttribute('aria-label', groupLabel);

  const buttons = new Map();
  for (const { id, name } of entries) {
    const b = document.createElement('button');
    b.setAttribute('role', 'radio');
    b.dataset.viz = id;
    b.textContent = name;
    b.addEventListener('click', () => {
      onSelect(id);
      armIdleTimer();
    });
    menu.appendChild(b);
    buttons.set(id, b);
  }

  let open = false;
  let idleTimer = null;

  function armIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => setOpen(false), MENU_IDLE_MS);
  }

  function setOpen(v) {
    open = v;
    root.classList.toggle('picker-open', v);
    toggle.setAttribute('aria-expanded', String(v));
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    if (v) armIdleTimer();
  }

  toggle.addEventListener('click', () => {
    onReveal?.();
    setOpen(!open);
  });

  function setActive(id) {
    for (const [bid, b] of buttons) {
      b.classList.toggle('active', bid === id);
      b.setAttribute('aria-checked', String(bid === id));
    }
  }
  setActive(activeId);

  root.append(toggle, menu);
  return { root, setActive, setOpen, isShown: () => open };
}
