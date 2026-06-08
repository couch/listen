const ITERATIONS = 200_000;
const KEY_LEN = 256;

function hexEncode(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexDecode(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function pbkdf2(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial, KEY_LEN
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return { salt: hexEncode(salt.buffer), hash: hexEncode(hash.buffer) };
}

export async function verifyPassword(password, saltHex, storedHash) {
  const salt = hexDecode(saltHex);
  const hash = await pbkdf2(password, salt);
  return hexEncode(hash.buffer) === storedHash;
}
