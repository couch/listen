import { hashPassword, verifyPassword } from './auth.js';

function detectLocal() {
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0') return true;
  if (h.endsWith('.local')) return true;
  if (/^10\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  return false;
}
export const IS_LOCAL = detectLocal();

const GH_DEFAULTS = { owner: '', repo: '', branch: 'main' };

export function getGHConfig() {
  try { return { ...GH_DEFAULTS, ...JSON.parse(localStorage.getItem('muxtape-gh-config') || '{}') }; }
  catch { return { ...GH_DEFAULTS }; }
}

export async function checkAuth() {
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
          <details id="auth-advanced" open>
            <summary>GitHub repo</summary>
            <input type="text" id="auth-owner" placeholder="owner (required)">
            <input type="text" id="auth-repo-name" placeholder="repo (required)">
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
      document.getElementById('auth-branch').value = gh.branch || GH_DEFAULTS.branch;
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
        const owner = document.getElementById('auth-owner').value.trim();
        const repo = document.getElementById('auth-repo-name').value.trim();
        const branch = document.getElementById('auth-branch').value.trim() || GH_DEFAULTS.branch;
        if (pw !== confirmPw) { errorEl.textContent = 'Passwords do not match'; return; }
        if (!token) { errorEl.textContent = 'GitHub token is required'; return; }
        if (!owner || !repo) { errorEl.textContent = 'GitHub owner and repo are required'; return; }
        const { salt, hash } = await hashPassword(pw);
        localStorage.setItem('muxtape-admin-salt', salt);
        localStorage.setItem('muxtape-admin-hash', hash);
        sessionStorage.setItem('muxtape-gh-token', token);
        localStorage.setItem('muxtape-gh-config', JSON.stringify({ owner, repo, branch }));
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
