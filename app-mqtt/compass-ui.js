import { calculateNeedleAngle, shortestRotation, readHeading } from './heading.js';
import { parseDeclination, correctHeading } from './declination.js';
import { maxCompassTilt, resolveAttitude } from './attitude.js?v=ui1-5';
import { createAlignmentDetector, createAlignmentFeedback } from './alignment.js?v=ui1-5';

const byId = (id) => document.getElementById(id);
const startButton = byId('start-heading');
const stopButton = byId('stop-heading');
const correction = byId('heading-correction');
const correctionMode = byId('correction-mode');
const manualCorrection = byId('manual-correction');
const correctionStatus = byId('compass-correction-status');
const markerOrbit = byId('destination-marker-orbit');
const dial = byId('compass-dial');
const rotor = byId('compass-rotor');
const status = byId('compass-status');
const launch = byId('start-compass');
const debug = byId('compass-debug');
const visibleReadings = {
  destination: byId('compass-destination'),
  bearing: byId('compass-bearing'),
  distance: byId('compass-distance'),
  heading: byId('device-heading'),
  needle: byId('needle-heading'),
};
const events = ['deviceorientation', 'deviceorientationabsolute'];
const debugFields = ['alpha', 'beta', 'gamma', 'webkitCompassHeading', 'webkitCompassAccuracy', 'absolute'];
let route;
let sample;
let updatedAt;
let dialRotation = null;
let frame = null;
let mode = 'idle';
let requestId = 0;
let timeout;
let message = '方位センサーは停止中です。';
let error = false;
let model;
let modelLoading = false;
let modelError = '';
let cachedCorrection;
const build = 'ui1-8';
let startupComplete = false;
const levelDisc = byId('level-disc');
const destinationPicker = byId('open-spots');
const destinationMeasure = byId('destination-measure');
const destinationChevron = destinationPicker.querySelector('.destination-chevron');
const currentDestinationFull = byId('current-destination-full');
const detectAlignment = createAlignmentDetector();
const signalAlignment = createAlignmentFeedback(markerOrbit.querySelector('.destination-marker'));
let alignmentSample;
let levelPosition = [0, 0];

function fitDestination() {
  const label = visibleReadings.destination;
  const pickerStyle = getComputedStyle(destinationPicker);
  const reserved = destinationChevron.offsetWidth +
    ['paddingLeft', 'paddingRight', 'columnGap'].reduce((sum, key) => sum + parseFloat(pickerStyle[key]), 0);
  const available = destinationPicker.parentElement.clientWidth - reserved;
  if (available <= 0) return;
  const base = Number.parseFloat(getComputedStyle(destinationPicker).fontSize);
  const minimum = Math.min(base, Math.max(14, base * 0.72));
  destinationMeasure.textContent = label.textContent;
  const measure = size => {
    destinationMeasure.style.fontSize = size + 'px';
    return Math.ceil(destinationMeasure.getBoundingClientRect().width) + 1;
  };
  let size = base;
  let width = measure(size);
  if (width > available) {
    let lo = minimum;
    let hi = base;
    for (let i = 0; i < 7; i++) {
      const midpoint = (lo + hi) / 2;
      if (measure(midpoint) <= available) lo = midpoint;
      else hi = midpoint;
    }
    size = lo;
    width = measure(size);
  }
  // 測定した幅をそのまま表示枠に割り当て、ボタンの内容依存の幅計算を避ける。
  label.style.fontSize = size + 'px';
  const labelWidth = Math.min(width, available);
  label.style.width = labelWidth + 'px';
  destinationPicker.style.width = (labelWidth + reserved) + 'px';
  label.classList.toggle('is-truncated', width > available);
}

function renderLevel(attitude) {
  const centered = !attitude || attitude.tilt < 2;
  const tilt = attitude ? Math.hypot(attitude.x, attitude.y) : 0;
  const scale = 108 / Math.max(1, tilt * 2);
  levelPosition = centered ? [0, 0] : [attitude.x * scale, attitude.y * scale].map((value, index) => {
    const previous = levelPosition[index];
    return Math.abs(value - previous) < 0.6 ? previous : previous + (value - previous) * 0.5;
  });
  levelDisc.style.transform = 'translate(' + levelPosition.map(value => value.toFixed(1) + '%').join(',') + ')';
}
const orientationApi = window.DeviceOrientationEvent;
const supported = window.isSecureContext && typeof orientationApi === 'function';
const needsPermission = supported && typeof orientationApi.requestPermission === 'function';
let permissionGranted = false;
let wantsOrientation = supported;
if (needsPermission) message = 'コンパスを使うには方位センサーの許可が必要です。';

async function prepareModel() {
  modelLoading = true;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 8000);
  try {
    // 係数計算のモジュールが欠落しても、センサーと手動補正を起動できるようにする。
    let loadWmm2025;
    try {
      ({ loadWmm2025 } = await import('./wmm2025.js?v=ui1-marker1'));
    } catch {
      throw new Error('wmm2025.js を読み込めません。公開フォルダのファイルを確認してください。');
    }
    model = await loadWmm2025(controller.signal);
  } catch (error) {
    modelError = error.name === 'AbortError' ? 'WMM2025の読み込みがタイムアウトしました。' : error.message;
  } finally {
    clearTimeout(deadline);
    modelLoading = false;
    render();
  }
}

function getAutomaticCorrection() {
  const today = new Date();
  const year = today.getFullYear();
  if (year < 2025 || year >= 2030) {
    return { reason: 'WMM2025の有効期間外です（2025年1月1日〜2029年12月31日）。端末の日付を確認してください。' };
  }
  if (!route?.position || route.positionFailed) return { reason: '現在地の取得を待っています。' };
  if (modelError) return { reason: modelError };
  if (!model) {
    if (!modelLoading) void prepareModel();
    return { reason: 'WMM2025の係数を読み込んでいます。' };
  }
  const { latitude, longitude } = route.position;
  const key = [latitude, longitude, year, today.getMonth(), today.getDate()].join(',');
  if (cachedCorrection?.key === key) return cachedCorrection;
  let result;
  try {
    // Phase 1の測位結果には高度を含まないため、WGS84楕円体高0 kmで計算する。
    const field = model(latitude, longitude, today);
    result = field.horizontal < 2000
      ? { reason: '水平磁場が弱い地域のため、自動補正を利用できません。' }
      : { degrees: field.declination, warning: field.horizontal < 6000 ? ' 水平磁場が弱く、方位の精度が低下する地域です。' : '' };
  } catch (error) {
    result = { reason: error.message };
  }
  cachedCorrection = { key, ...result };
  return cachedCorrection;
}

function showStatus(text, isError = false) {
  if (status.textContent !== text) status.textContent = text;
  status.dataset.error = String(isError);
}

function updateText(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

function portraitUpright() {
  const angle = window.screen.orientation?.angle ?? window.orientation;
  return window.matchMedia('(orientation: portrait)').matches && (angle == null || angle === 0);
}

function displayAngle(value) {
  return (((Math.round(value * 10) % 3600 + 3600) % 3600) / 10).toFixed(1) + '°';
}

function scheduleRender() {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    render();
  });
}

function render() {
  const reading = sample ? readHeading(sample) : null;
  const manual = correctionMode.value === 'manual';
  manualCorrection.hidden = !manual;
  const manualDegrees = manual ? parseDeclination(correction.value) : null;
  const invalidCorrection = manual && correction.value.trim() !== '' && manualDegrees === null;
  const activeCorrection = manual ? {
    degrees: manualDegrees,
    reason: invalidCorrection ? '磁気偏角は −180〜180° の数値で入力してください。例 −7.5'
      : '磁気偏角を入力してください。',
  } : getAutomaticCorrection();
  const declination = activeCorrection.degrees ?? null;
  const modeLabel = manual ? '手動補正（検証用）' : '自動補正（WMM2025）';
  const correctionText = declination === null ? activeCorrection.reason
    : declination.toFixed(2) + '°' + (activeCorrection.warning ?? '');
  const correctionLine = manual ? modeLabel + ' · ' + correctionText
    : declination === null ? '自動補正 · ' + activeCorrection.reason
      : '自動補正済み' + activeCorrection.warning;
  if (correctionStatus.textContent !== correctionLine) correctionStatus.textContent = correctionLine;
  correction.setAttribute('aria-invalid', String(invalidCorrection));
  const trueHeading = reading ? correctHeading(reading, declination) : null;
  const accuracy = sample?.webkitCompassAccuracy;
  updateText(byId('heading-accuracy-warning'), reading?.degrees != null &&
    (!Number.isFinite(accuracy) || accuracy > 20) ? '方位センサーの精度が低いか不明です。' : '');
  const target = route?.navigation?.bearingDegrees;
  const lowGpsAccuracy = route?.navigation?.distanceMeters <= route?.position?.accuracy;
  const screenAngle = window.screen.orientation?.angle ?? window.orientation ?? 0;
  const attitude = sample ? resolveAttitude(sample.alpha, sample.beta, sample.gamma, screenAngle) : null;
  const validPose = attitude !== null && attitude.tilt <= maxCompassTilt;
  renderLevel(attitude);
  let angle = null;
  let notice = message;
  const portrait = portraitUpright();
  if (mode === 'active' && !portrait) {
    notice = '縦画面に戻し、画面上端を前に向けてください。';
  } else if (sample) {
    if (reading.degrees === null) notice = '北を基準とする端末方位を取得できません。';
    else if (reading.reference === 'unknown') notice = '絶対方位イベントを受信しました。北の基準が未確認です。';
    else if (Number.isFinite(accuracy) && accuracy < 0) notice = '端末方位の精度が無効です。';
    else if (!validPose) notice = '画面を上にして、傾きを' + maxCompassTilt + '°以内にしてください。';
    else if (!route?.destination) notice = '目的地を設定してください。';
    else if (!route.position || route.positionFailed) notice = '';
    else if (trueHeading === null) notice = activeCorrection.reason;
    else if (!Number.isFinite(target)) notice = '目的地の方向を特定できません。';
    else {
      angle = calculateNeedleAngle(target, trueHeading);
      notice = lowGpsAccuracy ? '目的地が近く、方位が不安定な場合があります。' : '';
    }
  }
  showStatus(notice, error);
  updateText(byId('settings-heading-status'), sample ? '方位センサーからデータを受信しています。' : message);
  launch.hidden = !supported || (mode === 'active' && reading?.degrees != null);
  launch.disabled = mode !== 'idle';
  updateText(launch, mode === 'idle' ? 'コンパスを使う' : 'コンパスを準備中');

  const destinationName = route?.destination?.name ?? '目的地を選ぶ';
  if (visibleReadings.destination.textContent !== destinationName) {
    visibleReadings.destination.textContent = destinationName;
    fitDestination();
  }
  currentDestinationFull.hidden = !route?.destination;
  updateText(currentDestinationFull, route?.destination ? '使用中　' + destinationName : '');
  updateText(visibleReadings.bearing, route?.bearingText ?? '—');
  updateText(visibleReadings.distance, route?.distanceText ?? '—');
  const rotate = angle !== null;
  const alignDial = mode === 'active' && portrait && trueHeading !== null &&
    validPose && !(Number.isFinite(accuracy) && accuracy < 0);
  const nextRotation = alignDial ? shortestRotation(dialRotation ?? -trueHeading, -trueHeading) : null;
  // 0.5°未満の揺れだけを無視し、方位盤と針を同じフレームで更新する。
  if (nextRotation === null || dialRotation === null || Math.abs(nextRotation - dialRotation) >= 0.5) {
    dialRotation = nextRotation;
  }
  updateText(visibleReadings.heading, trueHeading === null ? '—' : displayAngle(rotate ? -dialRotation : trueHeading));
  updateText(visibleReadings.needle, rotate ? displayAngle(calculateNeedleAngle(target, -dialRotation)) : '—');
  markerOrbit.hidden = !rotate;
  const canSignal = rotate && !document.hidden && !document.querySelector('dialog[open]');
  if (!canSignal || sample !== alignmentSample) {
    if (detectAlignment(canSignal ? angle : null, performance.now(), route?.destination)) signalAlignment();
    alignmentSample = sample;
  }
  // 方位盤と三角を一緒に回し、三角の位置には真北からの目的地方位を重ねる。
  rotor.style.transform = 'rotate(' + (dialRotation ?? 0) + 'deg)';
  markerOrbit.style.transform = 'rotate(' + (rotate ? target : 0) + 'deg)';
  dial.classList.toggle('is-aligned', alignDial);
  // ハードウェア連動（mqtt-link.js）へ生の相対角と判定材料を渡す。送信可否と間引きは受け手側で行う。
  window.dispatchEvent(new CustomEvent('planetes:needle', { detail: {
    angle, accuracy, lowGpsAccuracy: Boolean(lowGpsAccuracy),
    hasDestination: Boolean(route?.destination),
    positionOk: Boolean(route?.position) && !route?.positionFailed,
    positionTimestamp: route?.position?.timestamp ?? null,
    sensorTimestamp: sample && updatedAt ? updatedAt.getTime() : null,
  } }));
  debug.textContent = [
    ...debugFields.map((key) => key + ': ' + (sample?.[key] ?? '—')),
    '採用データ: ' + (reading?.source ?? '—'),
    '基準: ' + (reading?.reference === 'magnetic' ? '磁北' : '不明'),
    '画面角度: ' + screenAngle + '°',
    '端末の傾き: ' + (attitude ? attitude.tilt.toFixed(1) + '°' : '—'),
    '姿勢からの上端方位（基準未確認・診断用）: ' + (attitude?.projectedHeading == null ? '—' : displayAngle(attitude.projectedHeading)),
    '補正方式: ' + modeLabel,
    'WMM2025: ' + (modelError || (model ? '係数読み込み済み' : modelLoading ? '読み込み中' : '未読み込み')),
    '補正値: ' + correctionText,
    '補正後の端末方位（真北推定）: ' + (trueHeading === null ? '—' : displayAngle(trueHeading)),
    '針の角度（表示）: ' + visibleReadings.needle.textContent,
    'センサー最終更新: ' + (updatedAt?.toLocaleTimeString('ja-JP') ?? '—'),
  ].join('\n');
}

function waitForReading() {
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    wantsOrientation = false;
    stop('方位センサーデータが届きません。端末とブラウザの設定を確認してください。', true);
  }, 3500);
}

function onReading(event) {
  // 有効なWebKit値と標準イベントが混在する場合は、直近のWebKit値を優先する。
  if (sample && readHeading(sample).reference === 'magnetic' &&
      readHeading(event).reference !== 'magnetic' && Date.now() - updatedAt.getTime() < 1000) return;
  sample = event;
  updatedAt = new Date();
  waitForReading();
  scheduleRender();
}

function stop(text = '方位センサーは停止中です。', isError = false) {
  requestId += 1;
  events.forEach((type) => window.removeEventListener(type, onReading));
  clearTimeout(timeout);
  sample = null;
  mode = 'idle';
  message = text;
  error = isError;
  startButton.disabled = false;
  stopButton.disabled = true;
  render();
}

async function start(userInitiated = false) {
  if (!startupComplete || mode !== 'idle' || document.hidden) return;
  if (!supported) {
    stop(window.isSecureContext ? 'このブラウザは方位センサーに対応していません。'
      : '方位センサーの利用にはHTTPSが必要です。', true);
    startButton.disabled = true;
    return;
  }
  if (!userInitiated && (!wantsOrientation || (needsPermission && !permissionGranted))) return;
  wantsOrientation = true;
  const id = ++requestId;
  error = false;
  startButton.disabled = true;
  stopButton.disabled = false;
  try {
    // ボタンのタップから同期的に許可を要求し、結果だけを待つ。
    if (needsPermission && !permissionGranted) {
      mode = 'requesting';
      message = '方位センサーの許可を確認しています。';
      render();
      const permission = await orientationApi.requestPermission(true);
      if (id !== requestId) return;
      if (permission !== 'granted') {
        wantsOrientation = false;
        stop('方位センサーが許可されていません。Safariの設定を確認してください。', true);
        return;
      }
      permissionGranted = true;
    }
    if (id !== requestId) return;
    if (document.hidden) {
      stop('ページが非表示になったため、方位センサーを停止しました。');
      return;
    }
    mode = 'active';
    message = '方位センサーデータを待っています。';
    events.forEach((type) => window.addEventListener(type, onReading));
    waitForReading();
    render();
  } catch {
    if (id === requestId) {
      wantsOrientation = false;
      stop('方位センサーの許可を確認できません。Safariの設定を確認してください。', true);
    }
  }
}

export function beginCompass() {
  startupComplete = true;
  return start(true);
}

startButton.addEventListener('click', () => start(true));
launch.addEventListener('click', () => start(true));
stopButton.addEventListener('click', () => {
  wantsOrientation = false;
  stop();
});
correction.addEventListener('input', render);
correctionMode.addEventListener('input', render);
correctionMode.addEventListener('change', render);
window.addEventListener('pageshow', () => {
  fitDestination();
  start();
});
window.addEventListener('planetes:navigation', (event) => {
  route = event.detail;
  render();
});
window.addEventListener('resize', render);
new ResizeObserver(fitDestination).observe(destinationPicker.parentElement);
window.visualViewport?.addEventListener('resize', fitDestination);
document.fonts?.ready.then(fitDestination);
document.fonts?.addEventListener('loadingdone', fitDestination);
window.screen.orientation?.addEventListener?.('change', render);
window.addEventListener('orientationchange', render);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) start();
  else if (mode === 'active') stop('方位センサーを一時停止しました。');
});
window.addEventListener('pagehide', () => {
  if (mode !== 'idle') stop('方位センサーを一時停止しました。');
});
render();
start();
byId('compass-build').textContent = build + '（JavaScript起動済み）';

