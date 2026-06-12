// Visualization picker — a quiet control in the overlay's bottom-right
// corner. The ⁘ toggle is always (faintly) visible; the menu accordion-
// expands upward out of it: on hover-capable pointers it opens while the
// mouse is over the picker (with a short leave grace), on touch it opens
// on tap and hides after a few idle seconds or an outside tap. Keyboard
// focus opens it too. DOM only — selection state and persistence live in
// visualizer.js.

const MENU_IDLE_MS = 6000;
export const PICKER_LEAVE_GRACE_MS = 400;

export function createVizPicker({ entries, activeId, onSelect, onReveal, groupLabel }) {
  const root = document.createElement('div');
  root.id = 'viz-picker';

  const toggle = document.createElement('button');
  toggle.id = 'viz-picker-toggle';
  toggle.setAttribute('aria-label', groupLabel);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-haspopup', 'true');
  toggle.textContent = '⁘';

  // The wrap is the accordion: grid-template-rows 0fr→1fr animates to the
  // menu's intrinsic height (the menu itself is min-height:0/overflow:hidden)
  const wrap = document.createElement('div');
  wrap.id = 'viz-picker-menu-wrap';
  const menu = document.createElement('div');
  menu.id = 'viz-picker-menu';
  menu.setAttribute('role', 'radiogroup');
  menu.setAttribute('aria-label', groupLabel);
  wrap.appendChild(menu);

  const hoverFine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const buttons = new Map();
  for (const { id, name } of entries) {
    const b = document.createElement('button');
    b.setAttribute('role', 'radio');
    b.dataset.viz = id;
    b.textContent = name;
    b.addEventListener('click', () => {
      onSelect(id);
      if (!hoverFine) armIdleTimer();
    });
    menu.appendChild(b);
    buttons.set(id, b);
  }

  let open = false;
  let idleTimer = null;
  let leaveTimer = null;

  function armIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => setOpen(false), MENU_IDLE_MS);
  }

  function setOpen(v) {
    open = v;
    root.classList.toggle('picker-open', v);
    toggle.setAttribute('aria-expanded', String(v));
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
    // Hover keeps the menu open on fine pointers; the idle close is for touch
    if (v && !hoverFine) armIdleTimer();
  }

  toggle.addEventListener('click', () => {
    onReveal?.();
    setOpen(!open);
  });

  if (hoverFine) {
    // pointerType guard: on hybrid touch+hover devices a tap fires
    // pointerenter before click — without it the tap would open the menu
    // and the click immediately toggle it closed again
    root.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse') return;
      if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
      onReveal?.();
      if (!open) setOpen(true);
    });
    root.addEventListener('pointerleave', e => {
      if (e.pointerType !== 'mouse') return;
      if (leaveTimer) clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => { leaveTimer = null; setOpen(false); }, PICKER_LEAVE_GRACE_MS);
    });
  }

  // Keyboard: focus opens the accordion (aria-expanded tracks via setOpen);
  // leaving the picker entirely closes it. :focus-visible keeps pointer-
  // initiated focus from fighting the click/tap toggles.
  root.addEventListener('focusin', e => {
    if (e.target.matches(':focus-visible') && !open) {
      onReveal?.();
      setOpen(true);
    }
  });
  root.addEventListener('focusout', e => {
    if (!root.contains(e.relatedTarget)) setOpen(false);
  });

  function setActive(id) {
    for (const [bid, b] of buttons) {
      b.classList.toggle('active', bid === id);
      b.setAttribute('aria-checked', String(bid === id));
    }
  }
  setActive(activeId);

  root.append(toggle, wrap);
  return { root, setActive, setOpen, isShown: () => open };
}
