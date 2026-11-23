import { normalizeAngle } from './heading.js';

export function parseDeclination(text) {
  const value = text.trim().normalize('NFKC').replace(/−/g, '-');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null;
  const degrees = Number(value);
  return Math.abs(degrees) <= 180 ? degrees : null;
}

// 将来、手入力の代わりに地磁気モデルが返す東偏正・西偏負の値を渡せる。
export function correctHeading(reading, declination) {
  if (reading.reference !== 'magnetic' || !Number.isFinite(declination) ||
      Math.abs(declination) > 180) return null;
  return normalizeAngle(reading.degrees + declination);
}
