export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const distance2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
export const randomBetween = (rng, min, max) => min + (max - min) * rng();
export const pick = (rng, items) => items[Math.floor(rng() * items.length)];

export function seededShuffle(rng, items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function allocateWeighted(total, weights) {
  const entries = Object.entries(weights);
  const exact = entries.map(([key, weight]) => [key, total * weight]);
  const result = Object.fromEntries(exact.map(([key, value]) => [key, Math.floor(value)]));
  let left = total - Object.values(result).reduce((sum, value) => sum + value, 0);
  exact.sort((a, b) => (b[1] - Math.floor(b[1])) - (a[1] - Math.floor(a[1])));
  for (let i = 0; i < left; i++) result[exact[i][0]]++;
  return result;
}

export function setVisible(object, visible) {
  object.visible = Boolean(visible);
  if (object.children) object.children.forEach(child => setVisible(child, visible));
}
