/**
 * Offline/online UI: banner, background dim, track disabling, bar hide.
 *
 * Use createOfflineUI() once per page; the returned { goOffline, goOnline }
 * close over private state so tests can create independent instances.
 *
 * @param {{
 *   offlineEl: Element,
 *   barEl: Element,
 *   trackEls: Element[],
 *   themeColorMeta: Element,
 *   bg: string,
 *   dimColor: (hex: string) => string,
 *   offlineText: string,
 *   getPlaying: () => boolean,
 *   getPlayer: () => { pause: () => void } | null,
 *   getCurrentIndex: () => number,
 *   releaseWakeLock: () => void,
 *   stopColorDrift: () => void,
 *   savePosition: () => void,
 *   updateBtn: () => void,
 *   setCachedBarH: (h: number) => void,
 * }} deps
 */
export function createOfflineUI(deps) {
  const {
    offlineEl, barEl, trackEls, themeColorMeta, bg, dimColor, offlineText,
    getPlaying, getPlayer, getCurrentIndex,
    releaseWakeLock, stopColorDrift, savePosition, updateBtn, setCachedBarH,
  } = deps;

  let isOffline = false;
  let offlineBg = null;
  let offlineHadBar = false;
  /** @type {(() => void) | null} */
  let hideListener = null;

  function goOffline() {
    if (isOffline) return;
    isOffline = true;

    // Cancel any pending hide-on-transitionend left over from a prior goOnline
    // that hasn't finished animating yet. Without this, the listener would
    // fire on the incoming (show) transition and hide the banner while offline.
    if (hideListener) {
      offlineEl.removeEventListener('transitionend', hideListener);
      hideListener = null;
    }

    offlineEl.textContent = offlineText;
    offlineEl.removeAttribute('hidden');
    // Force a synchronous reflow so the browser records the element's initial
    // transform (translateY(-100%)) before we add banner-visible. This is more
    // reliable than a single requestAnimationFrame — the RAF approach can fail
    // to trigger the CSS transition in Safari when coming from display:none.
    void offlineEl.offsetHeight;
    offlineEl.classList.add('banner-visible');

    releaseWakeLock();

    offlineBg = document.documentElement.style.getPropertyValue('--bg').trim() || bg;
    stopColorDrift();
    const dimmed = dimColor(offlineBg);
    document.documentElement.style.setProperty('--bg', dimmed);
    themeColorMeta.setAttribute('content', dimmed);

    document.body.classList.add('is-offline');
    trackEls.forEach(el => el.setAttribute('tabindex', '-1'));

    offlineHadBar = barEl.classList.contains('bar-visible');
    if (offlineHadBar) {
      if (getPlaying()) {
        getPlayer()?.pause();
        savePosition();
      }
      barEl.classList.remove('bar-visible');
      document.documentElement.style.setProperty('--bar-h', '0px');
    }
  }

  function goOnline() {
    if (!isOffline) return;
    isOffline = false;

    offlineEl.classList.remove('banner-visible');
    hideListener = () => { offlineEl.hidden = true; hideListener = null; };
    offlineEl.addEventListener('transitionend', hideListener, { once: true });

    const restoredBg = offlineBg || bg;
    document.documentElement.style.setProperty('--bg', restoredBg);
    themeColorMeta.setAttribute('content', restoredBg);

    document.body.classList.remove('is-offline');
    trackEls.forEach(el => el.setAttribute('tabindex', '0'));

    if (offlineHadBar && getCurrentIndex() >= 0) {
      barEl.classList.add('bar-visible');
      requestAnimationFrame(() => {
        const h = barEl.offsetHeight;
        setCachedBarH(h);
        document.documentElement.style.setProperty('--bar-h', `${h}px`);
      });
      updateBtn();
    }
    offlineHadBar = false;
  }

  return { goOffline, goOnline };
}
