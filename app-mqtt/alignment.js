import { normalizeAngle } from './heading.js';

const enterDegrees = 3;
const exitDegrees = 7;
const dwellMs = 300;
const cooldownMs = 1200;

export function createAlignmentDetector() {
  let target;
  let insideSince = null;
  let latched = false;
  let lastFeedback = -Infinity;
  return (angle, now, destination) => {
    if (target !== destination) {
      target = destination;
      insideSince = null;
      latched = false;
    }
    if (!destination || !Number.isFinite(angle)) {
      insideSince = null;
      return false;
    }
    const distance = Math.abs(normalizeAngle(angle + 180) - 180);
    if (distance >= exitDegrees) latched = false;
    if (latched || distance > enterDegrees) {
      insideSince = null;
      return false;
    }
    insideSince ??= now;
    if (now - insideSince < dwellMs || now - lastFeedback < cooldownMs) return false;
    latched = true;
    lastFeedback = now;
    return true;
  };
}

export function createAlignmentFeedback(marker, vibration = navigator) {
  let timeout;
  return () => {
    marker.classList.add('is-aligned');
    clearTimeout(timeout);
    timeout = setTimeout(() => marker.classList.remove('is-aligned'), 260);
    // 振動は任意。未対応・ブラウザによる拒否でも視覚フィードバックは続ける。
    try {
      if (typeof vibration.vibrate === 'function') vibration.vibrate(20);
    } catch {
      // 端末やブラウザが振動を許可しない場合も表示を維持する。
    }
  };
}
