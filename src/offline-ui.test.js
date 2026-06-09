// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createOfflineUI } from './offline-ui.js';

function makeOfflineEl() {
  const el = document.createElement('div');
  el.setAttribute('hidden', '');
  return el;
}

function makeBarEl() {
  const el = document.createElement('div');
  return el;
}

function makeTrackEls(n = 2) {
  return Array.from({ length: n }, () => {
    const li = document.createElement('li');
    li.setAttribute('tabindex', '0');
    return li;
  });
}

function makeThemeMeta() {
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'theme-color');
  meta.setAttribute('content', '#ff0000');
  return meta;
}

function makeDeps(overrides = {}) {
  const offlineEl = makeOfflineEl();
  const barEl = makeBarEl();
  const trackEls = makeTrackEls(2);
  const themeColorMeta = makeThemeMeta();
  const bg = '#aabbcc';

  return {
    offlineEl,
    barEl,
    trackEls,
    themeColorMeta,
    bg,
    dimColor: hex => hex + '80',
    offlineText: 'You are offline',
    getPlaying: vi.fn(() => false),
    getPlayer: vi.fn(() => null),
    getCurrentIndex: vi.fn(() => -1),
    releaseWakeLock: vi.fn(),
    stopColorDrift: vi.fn(),
    savePosition: vi.fn(),
    updateBtn: vi.fn(),
    setCachedBarH: vi.fn(),
    ...overrides,
  };
}

describe('createOfflineUI', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty('--bg');
    document.documentElement.style.removeProperty('--bar-h');
    document.body.classList.remove('is-offline');
  });

  describe('goOffline', () => {
    it('shows the banner', () => {
      const deps = makeDeps();
      const { goOffline } = createOfflineUI(deps);
      goOffline();
      expect(deps.offlineEl.hasAttribute('hidden')).toBe(false);
      expect(deps.offlineEl.classList.contains('banner-visible')).toBe(true);
    });

    it('sets the offline text', () => {
      const deps = makeDeps();
      const { goOffline } = createOfflineUI(deps);
      goOffline();
      expect(deps.offlineEl.textContent).toBe('You are offline');
    });

    it('dims the background', () => {
      const deps = makeDeps();
      document.documentElement.style.setProperty('--bg', '#112233');
      const { goOffline } = createOfflineUI(deps);
      goOffline();
      expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#11223380');
    });

    it('updates theme-color meta', () => {
      const deps = makeDeps();
      document.documentElement.style.setProperty('--bg', '#112233');
      const { goOffline } = createOfflineUI(deps);
      goOffline();
      expect(deps.themeColorMeta.getAttribute('content')).toBe('#11223380');
    });

    it('adds is-offline to body', () => {
      const deps = makeDeps();
      const { goOffline } = createOfflineUI(deps);
      goOffline();
      expect(document.body.classList.contains('is-offline')).toBe(true);
    });

    it('disables tabindex on tracks', () => {
      const deps = makeDeps();
      const { goOffline } = createOfflineUI(deps);
      goOffline();
      deps.trackEls.forEach(el => {
        expect(el.getAttribute('tabindex')).toBe('-1');
      });
    });

    it('calls releaseWakeLock', () => {
      const deps = makeDeps();
      const { goOffline } = createOfflineUI(deps);
      goOffline();
      expect(deps.releaseWakeLock).toHaveBeenCalledOnce();
    });

    it('calls stopColorDrift', () => {
      const deps = makeDeps();
      const { goOffline } = createOfflineUI(deps);
      goOffline();
      expect(deps.stopColorDrift).toHaveBeenCalledOnce();
    });

    it('is idempotent — does nothing on second call', () => {
      const deps = makeDeps();
      const { goOffline } = createOfflineUI(deps);
      goOffline();
      goOffline();
      expect(deps.releaseWakeLock).toHaveBeenCalledOnce();
    });

    it('hides bar and pauses player when bar is visible and playing', () => {
      const pauseVideo = vi.fn();
      const deps = makeDeps({
        getPlaying: () => true,
        getPlayer: () => ({ pauseVideo }),
      });
      deps.barEl.classList.add('bar-visible');
      const { goOffline } = createOfflineUI(deps);
      goOffline();
      expect(deps.barEl.classList.contains('bar-visible')).toBe(false);
      expect(document.documentElement.style.getPropertyValue('--bar-h')).toBe('0px');
      expect(pauseVideo).toHaveBeenCalledOnce();
      expect(deps.savePosition).toHaveBeenCalledOnce();
    });

    it('hides bar without pausing when bar visible but not playing', () => {
      const pauseVideo = vi.fn();
      const deps = makeDeps({
        getPlaying: () => false,
        getPlayer: () => ({ pauseVideo }),
      });
      deps.barEl.classList.add('bar-visible');
      const { goOffline } = createOfflineUI(deps);
      goOffline();
      expect(deps.barEl.classList.contains('bar-visible')).toBe(false);
      expect(pauseVideo).not.toHaveBeenCalled();
    });

    it('cancels a pending hideListener from a prior goOnline', () => {
      const deps = makeDeps();
      const { goOffline, goOnline } = createOfflineUI(deps);

      goOffline();
      goOnline();
      // Before transitionend fires, go offline again
      goOffline();

      // Now fire transitionend — it should NOT hide the (now visible) banner
      deps.offlineEl.dispatchEvent(new Event('transitionend'));
      expect(deps.offlineEl.hasAttribute('hidden')).toBe(false);
      expect(deps.offlineEl.classList.contains('banner-visible')).toBe(true);
    });
  });

  describe('goOnline', () => {
    it('removes banner-visible class', () => {
      const deps = makeDeps();
      const { goOffline, goOnline } = createOfflineUI(deps);
      goOffline();
      goOnline();
      expect(deps.offlineEl.classList.contains('banner-visible')).toBe(false);
    });

    it('hides the banner after transitionend', () => {
      const deps = makeDeps();
      const { goOffline, goOnline } = createOfflineUI(deps);
      goOffline();
      goOnline();
      expect(deps.offlineEl.hasAttribute('hidden')).toBe(false);
      deps.offlineEl.dispatchEvent(new Event('transitionend'));
      expect(deps.offlineEl.hasAttribute('hidden')).toBe(true);
    });

    it('restores the background color', () => {
      const deps = makeDeps();
      document.documentElement.style.setProperty('--bg', '#112233');
      const { goOffline, goOnline } = createOfflineUI(deps);
      goOffline();
      goOnline();
      expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#112233');
    });

    it('restores theme-color meta', () => {
      const deps = makeDeps();
      document.documentElement.style.setProperty('--bg', '#112233');
      const { goOffline, goOnline } = createOfflineUI(deps);
      goOffline();
      goOnline();
      expect(deps.themeColorMeta.getAttribute('content')).toBe('#112233');
    });

    it('removes is-offline from body', () => {
      const deps = makeDeps();
      const { goOffline, goOnline } = createOfflineUI(deps);
      goOffline();
      goOnline();
      expect(document.body.classList.contains('is-offline')).toBe(false);
    });

    it('restores tabindex on tracks', () => {
      const deps = makeDeps();
      const { goOffline, goOnline } = createOfflineUI(deps);
      goOffline();
      goOnline();
      deps.trackEls.forEach(el => {
        expect(el.getAttribute('tabindex')).toBe('0');
      });
    });

    it('is idempotent — does nothing when already online', () => {
      const deps = makeDeps();
      const { goOnline } = createOfflineUI(deps);
      goOnline();
      expect(deps.stopColorDrift).not.toHaveBeenCalled();
    });

    it('restores bar when it was visible and there is an active track', () => {
      const deps = makeDeps({ getCurrentIndex: () => 0 });
      deps.barEl.classList.add('bar-visible');
      const { goOffline, goOnline } = createOfflineUI(deps);
      goOffline();
      goOnline();
      expect(deps.barEl.classList.contains('bar-visible')).toBe(true);
      expect(deps.updateBtn).toHaveBeenCalledOnce();
    });

    it('does not restore bar when currentIndex is -1', () => {
      const deps = makeDeps({ getCurrentIndex: () => -1 });
      deps.barEl.classList.add('bar-visible');
      const { goOffline, goOnline } = createOfflineUI(deps);
      goOffline();
      goOnline();
      expect(deps.barEl.classList.contains('bar-visible')).toBe(false);
      expect(deps.updateBtn).not.toHaveBeenCalled();
    });

    it('does not restore bar when it was not visible offline', () => {
      const deps = makeDeps({ getCurrentIndex: () => 0 });
      const { goOffline, goOnline } = createOfflineUI(deps);
      goOffline();
      goOnline();
      expect(deps.barEl.classList.contains('bar-visible')).toBe(false);
    });
  });
});
