export function normalizeAngle(degrees) {
  return ((degrees % 360) + 360) % 360;
}

export function calculateNeedleAngle(destinationBearing, trueHeading) {
  return normalizeAngle(destinationBearing - trueHeading);
}

export function shortestRotation(previous, target) {
  return previous + normalizeAngle(target - previous + 180) - 180;
}

export function readHeading(event) {
  const heading = event.webkitCompassHeading;
  if (Number.isFinite(heading) && heading >= 0 && heading <= 360) {
    return { degrees: normalizeAngle(heading), source: 'webkitCompassHeading', reference: 'magnetic' };
  }
  // 水平な端末では alpha の回転方向がコンパスと逆。絶対イベントでも北の実装差がある。
  if ((event.absolute === true || event.type === 'deviceorientationabsolute') &&
      Number.isFinite(event.alpha)) {
    return { degrees: normalizeAngle(-event.alpha), source: event.type, reference: 'unknown' };
  }
  return { degrees: null, source: event.type, reference: 'unknown' };
}

