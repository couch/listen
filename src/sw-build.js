import crypto from 'crypto';

/**
 * Compute an 8-char hex hash from bundle output filenames.
 * Sorting ensures the result is stable regardless of insertion order.
 * @param {string[]} bundleKeys
 * @returns {string}
 */
export function computeCacheVersion(bundleKeys) {
  return crypto
    .createHash('sha1')
    .update([...bundleKeys].sort().join('\n'))
    .digest('hex')
    .slice(0, 8);
}

/**
 * Build the PRECACHE list: the root navigation URL plus all bundled assets.
 * HTML entry points other than index.html are included so admin/embed work offline.
 * sw.js and CNAME are excluded — sw.js must stay fresh, CNAME isn't an app resource.
 * @param {string[]} bundleKeys  — keys from Rollup's bundle object (e.g. "assets/main-abc.js")
 * @returns {string[]}
 */
export function buildPrecacheList(bundleKeys) {
  return [
    '/',
    '/config.js',
    ...bundleKeys
      .filter(k =>
        k.startsWith('assets/') ||
        (k.endsWith('.html') && k !== 'index.html')
      )
      .map(k => '/' + k),
  ];
}

/**
 * Patch the raw sw.js source: replace the __CACHE_VERSION__ placeholder and
 * expand PRECACHE to include all pre-computed entries.
 * @param {string} content
 * @param {string} version   — 8-char hex hash
 * @param {string[]} precache
 * @returns {string}
 */
export function patchServiceWorker(content, version, precache) {
  return content
    .replace('__CACHE_VERSION__', version)
    .replace("const PRECACHE = ['/'];", `const PRECACHE = ${JSON.stringify(precache)};`);
}
