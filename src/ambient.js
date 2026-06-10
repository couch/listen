// Slowly-drifting radial gradient orbs on a fixed viewport overlay.
// Active during playback; respects prefers-reduced-motion.
// Drives --orb1x/y, --orb2x/y, --orb-bright, --orb-dark on documentElement.
// The #ambient-bg element uses mix-blend-mode: overlay so the effect is perceptible
// on all palette colors without washing out to white.

let enabled = false;
let el = null;
let ambientFrame = null;
let targetOpacity = 0;
let currentOpacity = 0;
let startTime = null;
let lastTick = 0;

// Incommensurate periods (prime-ish seconds) prevent exact repetition within sessions
const ORB1 = { xPeriod: 37, yPeriod: 29, xPhase: 0,        yPhase: Math.PI / 3,   xAmp: 0.35, yAmp: 0.30 };
const ORB2 = { xPeriod: 53, yPeriod: 43, xPhase: Math.PI,  yPhase: Math.PI * 1.5, xAmp: 0.28, yAmp: 0.33 };

const MAX_BRIGHT = 0.35; // white highlight peak opacity (amplified by overlay blend)
const MAX_DARK   = 0.22; // shadow peak opacity
const FADE_RATE  = 1 / 90; // ~1.5s fade at 60fps

export function initAmbient(reducedMotion) {
  enabled = !reducedMotion;
  if (!enabled) return;
  el = document.createElement('div');
  el.id = 'ambient-bg';
  el.setAttribute('aria-hidden', 'true');
  document.body.prepend(el);
}

export function startAmbient() {
  if (!enabled) return;
  targetOpacity = 1;
  if (!ambientFrame) {
    startTime = performance.now();
    ambientFrame = requestAnimationFrame(tickAmbient);
  }
}

export function stopAmbient() {
  targetOpacity = 0;
  // RAF continues until currentOpacity drains to 0, then self-cancels
}

function tickAmbient(now) {
  if (currentOpacity < targetOpacity) {
    currentOpacity = Math.min(targetOpacity, currentOpacity + FADE_RATE);
  } else if (currentOpacity > targetOpacity) {
    currentOpacity = Math.max(targetOpacity, currentOpacity - FADE_RATE);
  }

  // Position updates throttled to ~30fps — orbs move too slowly to need 60
  if (now - lastTick >= 33) {
    lastTick = now;
    const t = (now - startTime) / 1000;
    const tau = 2 * Math.PI;

    const o1x = 50 + ORB1.xAmp * 100 * Math.sin(tau * t / ORB1.xPeriod + ORB1.xPhase);
    const o1y = 50 + ORB1.yAmp * 100 * Math.sin(tau * t / ORB1.yPeriod + ORB1.yPhase);
    const o2x = 50 + ORB2.xAmp * 100 * Math.sin(tau * t / ORB2.xPeriod + ORB2.xPhase);
    const o2y = 50 + ORB2.yAmp * 100 * Math.sin(tau * t / ORB2.yPeriod + ORB2.yPhase);

    const root = document.documentElement;
    root.style.setProperty('--orb1x', `${o1x.toFixed(2)}%`);
    root.style.setProperty('--orb1y', `${o1y.toFixed(2)}%`);
    root.style.setProperty('--orb2x', `${o2x.toFixed(2)}%`);
    root.style.setProperty('--orb2y', `${o2y.toFixed(2)}%`);
    root.style.setProperty('--orb-bright', (currentOpacity * MAX_BRIGHT).toFixed(4));
    root.style.setProperty('--orb-dark',   (currentOpacity * MAX_DARK).toFixed(4));
  }

  if (currentOpacity > 0 || targetOpacity > 0) {
    ambientFrame = requestAnimationFrame(tickAmbient);
  } else {
    ambientFrame = null;
  }
}
