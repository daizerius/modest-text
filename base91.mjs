// basE91 (Joachim Henke's algorithm), the text form of the compressed bundle in modest-text.html (build.mjs).
// About 23% larger than the bytes, where base64 is 33%: 16 KB less on the file. Printable ASCII only, so the HTML
// parser changes none of it (no control characters, no CR, no NUL), and without "<", so "</script" or "<!--" can
// never appear in it. The standard alphabet has "<"; here "-" takes its place.
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;-=>?@[]^_`{|}~"';

export function encode(bytes) {
  let b = 0, n = 0, out = '';
  for (const byte of bytes) {
    b |= byte << n;
    n += 8;
    if (n > 13) {
      let v = b & 8191;
      if (v > 88) { b >>= 13; n -= 13; } else { v = b & 16383; b >>= 14; n -= 14; }
      out += ALPHABET[v % 91] + ALPHABET[(v / 91) | 0];
    }
  }
  if (n) {
    out += ALPHABET[b % 91];
    if (n > 7 || b > 90) out += ALPHABET[(b / 91) | 0];
  }
  return out;
}

// The page's loader runs this very function (build.mjs inserts its source), so the tests check the code that runs.
export function decode(s, A) {
  const o = new Uint8Array(s.length);
  let v = -1, b = 0, n = 0, k = 0;
  for (let i = 0; i < s.length; i++) {
    const d = A.indexOf(s[i]);
    if (d < 0) continue;
    if (v < 0) { v = d; continue; }
    v += d * 91;
    b |= v << n;
    n += (v & 8191) > 88 ? 13 : 14;
    do { o[k++] = b & 255; b >>= 8; n -= 8; } while (n > 7);
    v = -1;
  }
  if (v > -1) o[k++] = (b | (v << n)) & 255;
  return o.subarray(0, k);
}
