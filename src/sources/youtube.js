import { STATE } from './ids.js';

// YT.PlayerState integers → normalized source states (null = no mapping;
// YT also fires undocumented values we ignore).
export function mapYouTubeState(code) {
  switch (code) {
    case -1: return STATE.UNSTARTED;
    case 0: return STATE.ENDED;
    case 1: return STATE.PLAYING;
    case 2: return STATE.PAUSED;
    case 3: return STATE.BUFFERING;
    case 5: return STATE.CUED;
    default: return null;
  }
}

// YT error codes: 2 invalid id, 5 HTML5 player error, 100 removed/private,
// 101/150 embed-restricted — every error event is fatal for this video, so
// they all normalize to 'unplayable' (the caller skips the track).
export function mapYouTubeError() {
  return 'unplayable';
}

/**
 * YouTube IFrame API source. The API script loads eagerly at construction —
 * creating the player from an async callback later would lose the
 * user-gesture context on iOS, preventing autoplay on the first track click.
 *
 * @param {{ onReady: () => void,
 *           onState: (state: string) => void,
 *           onError: (kind: 'unplayable'|'blocked') => void }} callbacks
 */
export function createYouTubeSource({ onReady, onState, onError }) {
  let player = null;
  let ready = false;

  window.onYouTubeIframeAPIReady = () => {
    player = new YT.Player("yt-player", {
      width: "1", height: "1",
      playerVars: {
        autoplay: 0, controls: 0, disablekb: 1,
        fs: 0, iv_load_policy: 3, rel: 0,
        modestbranding: 1, playsinline: 1,
      },
      events: {
        onReady(e) {
          e.target.getIframe().setAttribute(
            "allow", "autoplay; encrypted-media; picture-in-picture"
          );
          ready = true;
          onReady();
        },
        onStateChange(e) {
          const s = mapYouTubeState(e.data);
          if (s) onState(s);
        },
        onError(e) {
          console.warn('YouTube player error', e?.data);
          onError(mapYouTubeError(e?.data));
        },
      },
    });
  };
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);

  return {
    isReady: () => ready,
    load(track, { startSeconds, cue } = {}) {
      if (cue) player.cueVideoById({ videoId: track.id, startSeconds });
      else player.loadVideoById(track.id);
    },
    play: () => player?.playVideo?.(),
    pause: () => player?.pauseVideo?.(),
    stop: () => { try { player?.stopVideo?.(); } catch {} },
    seekTo: s => player?.seekTo?.(s, true),
    getCurrentTime: () => player?.getCurrentTime?.() || 0,
    getDuration: () => player?.getDuration?.() || 0,
    getState: () => mapYouTubeState(player?.getPlayerState?.()) || STATE.UNSTARTED,
  };
}
