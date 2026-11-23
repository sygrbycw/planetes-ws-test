const earthRadiusMeters = 6371000;
const radians = Math.PI / 180;
const compassPoints = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function validateCoordinates(point, label) {
  if (!Number.isFinite(point?.latitude) || Math.abs(point.latitude) > 90 ||
      !Number.isFinite(point?.longitude) || Math.abs(point.longitude) > 180) {
    throw new Error(label + 'の緯度または経度が無効です。');
  }
}

export function calculateNavigation(position, destination) {
  validateCoordinates(position, '現在地');
  validateCoordinates(destination, '目的地');

  const start = position.latitude * radians;
  const end = destination.latitude * radians;
  const deltaLatitude = end - start;
  const deltaLongitude = ((destination.longitude - position.longitude + 540) % 360 - 180) * radians;

  // Haversine公式。丸め誤差で平方根の引数が負になるのを防ぐ。
  const haversine = Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(start) * Math.cos(end) * Math.sin(deltaLongitude / 2) ** 2;
  const a = Math.max(0, Math.min(1, haversine));
  const distanceMeters = 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const east = Math.sin(deltaLongitude) * Math.cos(end);
  const north = Math.cos(start) * Math.sin(end) -
    Math.sin(start) * Math.cos(end) * Math.cos(deltaLongitude);

  // 1m以内、対蹠点、出発点が極の場合は初期方位を表示しない。
  const directionDefined = distanceMeters > 1 && Math.hypot(east, north) > 1e-12 &&
    Math.abs(position.latitude) < 90;
  const bearingDegrees = directionDefined
    ? (Math.atan2(east, north) / radians + 360) % 360
    : null;
  const compassPoint = bearingDegrees === null
    ? null
    : compassPoints[Math.round(bearingDegrees / 45) % compassPoints.length];
  return { distanceMeters, bearingDegrees, compassPoint };
}
