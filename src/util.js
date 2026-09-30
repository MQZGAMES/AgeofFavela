'use strict';
(function (AF) {
  // RNG determinístico (mulberry32) com helpers
  AF.makeRng = function (seed) {
    let a = seed >>> 0;
    const r = function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
    r.pick = arr => arr[Math.floor(r() * arr.length)];
    r.chance = p => r() < p;
    r.range = (lo, hi) => lo + r() * (hi - lo);
    return r;
  };

  // Hash 2D estável -> [0,1)
  AF.hash = function (x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  // Value noise suave
  AF.noise = function (x, y, s) {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = AF.hash(x0, y0, s), b = AF.hash(x0 + 1, y0, s);
    const c = AF.hash(x0, y0 + 1, s), d = AF.hash(x0 + 1, y0 + 1, s);
    const top = a + (b - a) * sx, bot = c + (d - c) * sx;
    return top + (bot - top) * sy;
  };

  AF.shuffle = function (arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  // Escurece (k<1) ou clareia (k>1) uma cor hex. Memoizado.
  const shadeCache = new Map();
  AF.shade = function (hex, k) {
    const key = hex + k;
    let v = shadeCache.get(key);
    if (v) return v;
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (k <= 1) { r *= k; g *= k; b *= k; }
    else { const f = k - 1; r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    v = `rgb(${r | 0},${g | 0},${b | 0})`;
    shadeCache.set(key, v);
    return v;
  };

  AF.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
})(window.AF = window.AF || {});
