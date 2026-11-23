import { createLocationTracker } from './location.js?v=ui1-2';
import { updatePosition, showPositionError } from './navigation-ui.js';
import { formatDms, formatMeters } from './position-display.js?v=ui1-2';

const byId = id => document.getElementById(id);
const once = byId('once');
const watch = byId('watch');
const stop = byId('stop');
const status = byId('status');
const summary = byId('gps-summary');
let mode = 'idle';
let wantsWatch = true;
let freshnessTimer;
const staleAfterMs = 60_000;

const errors = {
  1: '位置情報が許可されていません。端末とサイトの設定を確認し、位置情報更新を再開してください。',
  2: '現在地を特定できません。電波状況を確認してください。',
  3: '位置情報の取得がタイムアウトしました。',
};

function showStatus(message, shortMessage, error = false) {
  status.dataset.error = String(error);
  summary.dataset.error = String(error);
  if (status.textContent !== message) status.textContent = message;
  if (summary.textContent !== shortMessage) summary.textContent = shortMessage;
}

function setMode(value) {
  clearTimeout(freshnessTimer);
  mode = value;
  once.disabled = value === 'once';
  watch.disabled = value !== 'idle';
  stop.disabled = value === 'idle' && !wantsWatch;
}

function showReading(reading) {
  byId('latitude').textContent = reading.latitude.toFixed(6) + '°';
  byId('longitude').textContent = reading.longitude.toFixed(6) + '°';
  byId('accuracy').textContent = '半径 約' + Math.round(reading.accuracy) + ' m';
  byId('timestamp').textContent = new Date(reading.timestamp).toLocaleTimeString('ja-JP');
  byId('altitude').textContent = formatMeters(reading.altitude);
  byId('altitude-accuracy').textContent = formatMeters(reading.altitudeAccuracy);
  byId('dms-latitude').textContent = formatDms(reading.latitude, 'latitude');
  byId('dms-longitude').textContent = formatDms(reading.longitude, 'longitude');
  byId('current-altitude').textContent = formatMeters(reading.altitude);
  updatePosition(reading);
}

function watchFreshness(timestamp) {
  clearTimeout(freshnessTimer);
  const age = Math.max(0, Date.now() - timestamp);
  const markWaiting = () => showStatus('監視中です。新しい測位結果が1分以上届いていません。', '新しい測位を待機中');
  if (age >= staleAfterMs) markWaiting();
  else freshnessTimer = setTimeout(markWaiting, staleAfterMs - age);
}

if (!window.isSecureContext || !navigator.geolocation) {
  showStatus('位置情報を利用できません。HTTPS接続とブラウザの対応状況を確認してください。', '位置情報を利用できません。', true);
} else {
  const tracker = createLocationTracker(navigator.geolocation);

  function start(continuous) {
    if (document.hidden || mode === 'once' || (continuous && mode === 'watch')) return;
    setMode(continuous ? 'watch' : 'once');
    showStatus(continuous ? '位置情報を継続監視しています。最初の測位を待っています。' : '単発で現在地を取得しています。',
      '現在地を取得中');
    if (continuous) watchFreshness(Date.now());
    tracker.start(continuous, reading => {
      showReading(reading);
      showStatus(continuous ? '位置情報を継続監視しています。' : '現在地を1回取得しました。',
        continuous ? '現在地を更新中' : '現在地を取得済み');
      if (continuous) watchFreshness(reading.timestamp);
      else finishOnce();
    }, error => {
      clearTimeout(freshnessTimer);
      const retrying = continuous && (error.code === 2 || error.code === 3);
      if (error.code === 1 || (continuous && !retrying)) wantsWatch = false;
      if (!retrying) {
        tracker.stop();
        setMode('idle');
      }
      showPositionError();
      showStatus((errors[error.code] ?? '位置情報を取得できませんでした。') +
        (retrying ? ' 次の測位を待っています。' : ''), error.code === 1 ? '位置情報の許可が必要です。設定を確認してください。'
        : '現在地を取得できません。', true);
      if (!continuous && wantsWatch) resumeWatch();
    });
  }

  function resumeWatch() {
    if (wantsWatch && mode === 'idle') start(true);
  }

  function finishOnce() {
    setMode('idle');
    // 単発取得の前に継続更新が有効だった場合だけ、元の監視に戻す。
    resumeWatch();
  }

  function suspend() {
    if (mode === 'idle') return;
    tracker.stop();
    setMode('idle');
    showStatus('ページ切り替え中は位置情報更新を一時停止します。', '位置情報更新を一時停止中');
  }

  once.addEventListener('click', () => start(false));
  watch.addEventListener('click', () => {
    wantsWatch = true;
    resumeWatch();
  });
  stop.addEventListener('click', () => {
    wantsWatch = false;
    tracker.stop();
    setMode('idle');
    showStatus('位置情報更新を停止しました。', '位置情報の更新を停止中');
  });
  document.addEventListener('visibilitychange', () => document.hidden ? suspend() : resumeWatch());
  window.addEventListener('pagehide', suspend);
  window.addEventListener('pageshow', resumeWatch);
  resumeWatch();
}
