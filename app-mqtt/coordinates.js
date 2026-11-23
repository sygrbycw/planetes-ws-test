import { validateCoordinates } from './destination.js?v=ui1-coordinates1';

export function parseCoordinate(value) {
  const text = value.trim().normalize('NFKC').replace(/−/g, '-');
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? Number(text) : NaN;
}

export function parseCoordinatePair(value) {
  const normalized = value.normalize('NFKC').trim();
  const text = /^\([^()]*\)$/.test(normalized) ? normalized.slice(1, -1).trim() : normalized;
  const parts = /[,、;]/.test(text) ? text.split(/[,、;]/) : text.split(/\s+/);
  if (parts.length !== 2 || parts.some(part => !part.trim())) {
    throw new Error('緯度・経度の順で、数値を2つ貼り付けてください。');
  }
  return validateCoordinates(...parts.map(parseCoordinate));
}
