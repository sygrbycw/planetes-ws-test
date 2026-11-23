export function formatDms(value, axis) {
  const latitude = axis === 'latitude';
  if (!Number.isFinite(value) || Math.abs(value) > (latitude ? 90 : 180)) return '—';

  // 秒の総数を先に丸めると、60秒と60分の繰り上がりも同時に処理できる。
  const total = Math.round(Math.abs(value) * 3600);
  const degrees = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const direction = latitude ? (value < 0 ? 'S' : 'N') : (value < 0 ? 'W' : 'E');
  return degrees + '°' + String(minutes).padStart(2, '0') + '′' + String(seconds).padStart(2, '0') + '″ ' + direction;
}

export function formatMeters(value) {
  return Number.isFinite(value) ? Math.round(value) + ' m' : '—';
}
