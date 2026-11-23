import { calculateNavigation } from './navigation.js';

const destinationName = document.getElementById('navigation-destination');
const bearing = document.getElementById('navigation-bearing');
const distance = document.getElementById('navigation-distance');
const status = document.getElementById('navigation-status');
let position = null;
let destination = null;
let destinationError = '';
let positionFailed = false;

function showStatus(message, isError = false) {
  status.dataset.error = String(isError);
  if (status.textContent !== message) status.textContent = message;
}

function render() {
  let navigation = null;
  try {
    if (position && destination && !destinationError) {
      navigation = calculateNavigation(position, destination);
    }
    renderNavigation(navigation);
  } catch (error) {
    bearing.textContent = '—';
    distance.textContent = '—';
    showStatus(error.message, true);
  }
  window.dispatchEvent(new CustomEvent('planetes:navigation', { detail: {
    destination, position, positionFailed, navigation,
    bearingText: bearing.textContent, distanceText: distance.textContent,
  } }));
}

function renderNavigation(result) {
  destinationName.textContent = destination?.name ?? '目的地は未設定です。';
  bearing.textContent = '—';
  distance.textContent = '—';
  if (destinationError) return showStatus(destinationError, true);
  if (!destination) return showStatus('目的地を設定してください。');
  if (!position) {
    return showStatus(positionFailed ? '現在地を取得できません。GPS操作欄を確認してください。'
      : '現在地を取得すると方位と距離を表示します。', positionFailed);
  }

    const meters = result.distanceMeters;
    distance.textContent = meters < 1000
      ? Math.min(999.9, Math.round(meters * 10) / 10) + ' m'
      : (meters / 1000).toFixed(2) + ' km';
    const stale = positionFailed ? ' 前回の測位結果を使用しています。' : '';
    if (result.bearingDegrees === null) {
      return showStatus('方向を特定できません。' + stale);
    }
    const degrees = (Math.round(result.bearingDegrees * 10) % 3600) / 10;
    bearing.textContent = degrees.toFixed(1) + '°（' + result.compassPoint + '）';
    if (Number.isFinite(position.accuracy) && meters <= position.accuracy) {
      return showStatus('目的地までの距離が現在地の推定精度の範囲内です。方位が不安定な場合があります。' + stale);
    }
    showStatus(positionFailed ? '前回の測位結果を使用しています。' : '現在地からの方位と距離を表示しています。');
}

// 座標はページ内だけに保持し、測位と目的地のどちらが変わっても再計算する。
export function updatePosition(reading) {
  position = reading;
  positionFailed = false;
  render();
}

export function showPositionError() {
  positionFailed = true;
  render();
}

export function updateDestination(value, error = '') {
  destination = value;
  destinationError = error;
  render();
}
