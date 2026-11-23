// ハードウェア連動（MQTT）。compass-ui.js が毎描画で出す 'planetes:needle' を受け、
// 明示的に接続・送信を有効化したときだけ、間引いて ATOM Lite へ角度を送る。
import { DEFAULT_SETTINGS, decide, shouldSend, validSettings } from './mqtt-mapping.js?v=mqtt1';

// 接続情報（秘密ではない）。パスワードはここにもどこにも保存しない。
const BROKER_URL = 'wss://rd6ce23e.ala.asia-southeast1.emqxsl.com:8084/mqtt';
const USERNAME = 'planetes-web';
const TOPIC = 'planetes/01/angle';
const MIN_INTERVAL_MS = 200;   // 全メッセージ共通で最大5Hz
const DEADBAND_DEG = 2;        // 前回送信からの変化がこれ未満なら送らない

const byId = (id) => document.getElementById(id);
const ui = {
  status: byId('mqtt-status'),
  summary: byId('mqtt-summary'),
  password: byId('mqtt-password'),
  connect: byId('mqtt-connect'),
  disconnect: byId('mqtt-disconnect'),
  enable: byId('mqtt-enable'),
  range: byId('mqtt-range'),
  center: byId('mqtt-center'),
  scale: byId('mqtt-scale'),
  invert: byId('mqtt-invert'),
  last: byId('mqtt-last'),
};

const randomId = () => {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
};
const clientId = 'planetes-app-' + randomId();

let client = null;
let closing = null;      // 利用者が切断を要求したクライアント
let connected = false;
let enabled = false;
let latest = null;       // 最新の 'planetes:needle' の detail（保留は常にこの1件だけ）
let timer = null;
let lastSentAt = 0;
let lastSent = null;     // 最後に送ったメッセージ
let rangeState = { inRange: false };
let sentCount = 0;
let activeSettings = null; // 送信を有効にした時点の設定。送信中は入力欄の値を読まない

function settings() {
  return {
    range: Number(ui.range.value),
    center: Number(ui.center.value),
    scale: Number(ui.scale.value),
    invert: ui.invert.checked,
  };
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function refresh(note) {
  const busy = client !== null;
  ui.connect.disabled = busy;
  ui.disconnect.disabled = !busy;
  ui.password.disabled = busy;
  ui.enable.disabled = !connected;
  if (!connected) ui.enable.checked = false;
  const state = !busy ? '未接続' : closing === client ? '切断中…' : !connected ? '接続中…' : enabled ? '接続済み · 送信中' : '接続済み · 送信停止中';
  setText(ui.status, note ? state + ' · ' + note : state);
  ui.status.dataset.error = String(Boolean(note) && !connected);
  setText(ui.summary, client === null ? '' : 'ハードウェア連動: ' + state.replace('接続済み · ', ''));
  ui.summary.hidden = client === null;
}

// 送信を止め、保留中の送信と角度履歴を捨てる。
function disableSending(note) {
  enabled = false;
  activeSettings = null;
  ui.enable.checked = false;
  clearTimeout(timer);
  timer = null;
  lastSent = null;
  rangeState = { inRange: false };
  refresh(note);
}

function forgetPassword(target) {
  if (target?.options) {
    target.options.password = undefined;
    if (target.options.wsOptions) target.options.wsOptions = undefined;
  }
}

function release(target, note) {
  forgetPassword(target);
  if (client !== target) return;
  client = null;
  connected = false;
  disableSending(note);
}

function connect() {
  if (client) return;
  if (typeof window.mqtt?.connect !== 'function') {
    refresh('MQTT.jsを読み込めていません。');
    return;
  }
  const password = ui.password.value;
  if (password === '') {
    refresh('パスワードを入力してください。');
    ui.password.focus();
    return;
  }
  const target = window.mqtt.connect(BROKER_URL, {
    protocolVersion: 4,
    clientId,
    username: USERNAME,
    password,
    clean: true,
    keepalive: 30,
    connectTimeout: 10000,
    reconnectPeriod: 0,       // 自動再接続しない（パスワードを保持し続けないため）
    queueQoSZero: false,      // 切断中の角度を溜めて、再接続後に古い指令を送らない
    resubscribe: false,
    timerVariant: 'native',   // Workerを使わない（CSPを広げない）
  });
  client = target;
  ui.password.value = '';
  refresh();
  target.on('connect', () => {
    if (client !== target) return;
    connected = true;
    forgetPassword(target);   // 再接続しないので、接続後は参照を残さない
    refresh();
  });
  target.on('error', (error) => {
    const code = error?.code;
    const note = code === 4 || code === 5 ? '認証エラー（code ' + code + '）' : 'エラー: ' + (error?.message || String(error));
    target.end(true);
    release(target, note);
  });
  target.on('close', () => {
    if (closing === target) release(target);
    else release(target, connected ? '接続が切れました。再接続してください。' : '接続できませんでした。');
  });
  target.on('end', () => release(target));
}

function disconnect() {
  const target = client;
  if (!target) return;
  closing = target;
  disableSending();
  // 画面は 'close'／'end' を受けてから未接続に戻す（接続途中の切断で同じIDの接続が競合しないように）。
  target.end(!connected);
}

function schedule() {
  if (!enabled || !connected || timer !== null) return;
  const wait = Math.max(0, Math.ceil(lastSentAt + MIN_INTERVAL_MS - performance.now()));
  timer = setTimeout(flush, wait);
}

function flush() {
  timer = null;
  if (!enabled || !activeSettings || !connected || !client?.connected || document.hidden) return;
  // タイマーの丸めで200 ms未満にならないよう、実際の経過時間を確かめる。
  if (performance.now() - lastSentAt < MIN_INTERVAL_MS) {
    schedule();
    return;
  }
  const result = decide(latest, activeSettings, rangeState, Date.now());
  rangeState = { inRange: result.inRange };
  const { message } = result;
  if (!shouldSend(message, lastSent, DEADBAND_DEG)) return;
  const payload = JSON.stringify(message);
  lastSentAt = performance.now();
  lastSent = message;
  client.publish(TOPIC, payload, { qos: 0, retain: false }, (error) => {
    if (error) {
      refresh('送信失敗: ' + (error.message || String(error)));
      return;
    }
    sentCount += 1;
    const deltaText = result.delta === null ? '' : ' · 相対 ' + Math.round(result.delta) + '°';
    setText(ui.last, '最終送信（サーボ到達は未確認）: ' + payload + deltaText + ' · ' + sentCount + '件');
  });
}

window.addEventListener('planetes:needle', (event) => {
  latest = event.detail;   // ここでは値の差し替えと予約だけ行い、描画を重くしない
  schedule();
});

ui.connect.addEventListener('click', connect);
ui.disconnect.addEventListener('click', disconnect);
ui.password.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') connect();
});
ui.enable.addEventListener('change', () => {
  if (!ui.enable.checked) {
    disableSending();
    return;
  }
  const snapshot = settings();
  if (!connected || !validSettings(snapshot)) {
    disableSending(connected ? '校正値が範囲外です。' : undefined);
    return;
  }
  activeSettings = Object.freeze(snapshot);
  enabled = true;
  lastSent = null;
  rangeState = { inRange: false };
  refresh();
  schedule();
});
// 反転・範囲・校正を変えると針が跳ぶため、変更したら送信を止める。
[ui.range, ui.center, ui.scale, ui.invert].forEach((input) => {
  const stop = () => {
    if (enabled) disableSending('設定を変えたため送信を止めました。');
  };
  input.addEventListener('input', stop);
  input.addEventListener('change', stop);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && enabled) disableSending('画面が非表示になったため送信を止めました。');
});
window.addEventListener('pagehide', () => {
  if (client) client.end(true);
});

ui.range.value = String(DEFAULT_SETTINGS.range);
ui.center.value = String(DEFAULT_SETTINGS.center);
ui.scale.value = String(DEFAULT_SETTINGS.scale);
ui.invert.checked = DEFAULT_SETTINGS.invert;
refresh();
