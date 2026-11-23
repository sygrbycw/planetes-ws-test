import { loadDestination, validateDestination } from './destination.js';
const key = 'planetes.favorites.v1';

export function loadFavorites() {
  const raw = localStorage.getItem(key);
  if (raw === null) {
    const legacy = loadDestination();
    if (!legacy) return { spots: [], selectedId: null };
    const id = crypto.randomUUID();
    const migrated = { spots: [{ id, ...legacy }], selectedId: id };
    saveFavorites(migrated);
    return migrated;
  }

  const data = JSON.parse(raw);
  if (!Array.isArray(data.spots)) throw new Error('お気に入りの形式が無効です。');
  const ids = new Set();
  const spots = data.spots.map(({ id, name, latitude, longitude }) => {
    if (typeof id !== 'string' || !id || ids.has(id)) throw new Error('お気に入りのIDが無効です。');
    ids.add(id);
    return { id, ...validateDestination(name, latitude, longitude) };
  });
  return { spots, selectedId: ids.has(data.selectedId) ? data.selectedId : null };
}

export function saveFavorites(state) {
  localStorage.setItem(key, JSON.stringify(state));
}
