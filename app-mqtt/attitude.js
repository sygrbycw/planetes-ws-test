import { normalizeAngle } from './heading.js';

const radians = Math.PI / 180;
export const maxCompassTilt = 60;

export function resolveAttitude(alpha, beta, gamma, screenAngle = 0) {
  if (![beta, gamma, screenAngle].every(Number.isFinite)) return null;
  const b = beta * radians;
  const g = gamma * radians;
  const screen = screenAngle * radians;
  // W3C Z-X′-Y″。Rの第3行は端末座標で表した地球の上方向。
  const upX = -Math.cos(b) * Math.sin(g);
  const upY = Math.sin(b);
  const upZ = Math.cos(b) * Math.cos(g);
  const rightX = Math.cos(screen);
  const rightY = Math.sin(screen);
  const topX = -rightY;
  const topY = rightX;
  let projectedHeading = null;
  if (Number.isFinite(alpha)) {
    // Rz(alpha) Rx(beta) Ry(gamma) を画面上端ベクトルへ適用し、地平面へ射影。
    const a = alpha * radians;
    const x = Math.cos(g) * topX;
    const y = Math.sin(b) * Math.sin(g) * topX + Math.cos(b) * topY;
    const east = Math.cos(a) * x - Math.sin(a) * y;
    const north = Math.sin(a) * x + Math.cos(a) * y;
    if (Math.hypot(east, north) > 0.2) projectedHeading = normalizeAngle(Math.atan2(east, north) / radians);
  }
  return {
    tilt: Math.atan2(Math.hypot(upX, upY), upZ) / radians,
    x: upX * rightX + upY * rightY,
    y: -(upX * topX + upY * topY),
    projectedHeading,
  };
}
