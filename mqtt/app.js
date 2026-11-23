'use strict';

// 接続情報（秘密ではない）。パスワードはここに書かない。
const BROKER_URL = 'wss://rd6ce23e.ala.asia-southeast1.emqxsl.com:8084/mqtt';
const USERNAME = 'planetes-web';
const TOPIC = 'planetes/01/angle';
const CONNECT_TIMEOUT_MS = 10000;

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const passwordEl = $('password');
const connectBtn = $('connect');
const disconnectBtn = $('disconnect');
const angleEl = $('angle');
const sendBtn = $('send');
const angleBtns = [...document.querySelectorAll('button.angle')];
const angleError = $('angle-error');
const logEl = $('log');

const randomId = () => {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
};
const clientId = 'planetes-web-safari-' + randomId();

let client = null;
let sentCount = 0;

const CONNACK_REASONS = {
  1: '未対応のプロトコルバージョン',
  2: 'Client ID が拒否された',
  3: 'サーバー利用不可',
  4: 'ユーザー名またはパスワードが正しくない（認証エラー）',
  5: '認可されていない（認証・ACL で拒否）',
};

function log(text, kind = '') {
  const now = new Date();
  const stamp = now.toTimeString().slice(0, 8) + '.' + String(now.getMilliseconds()).padStart(3, '0');
  const line = document.createElement('span');
  if (kind) line.className = kind;
  line.textContent = '[' + stamp + '] ' + text + '\n';
  logEl.append(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(state, text) {
  statusEl.dataset.state = state;
  statusEl.textContent = text;
  const connected = state === 'connected';
  const busy = state === 'connecting' || connected;
  connectBtn.disabled = busy;
  disconnectBtn.disabled = !busy;
  passwordEl.disabled = busy;
  sendBtn.disabled = !connected;
  angleBtns.forEach((b) => { b.disabled = !connected; });
}

// パスワードへの参照を可能な範囲で消す（JS の文字列自体は消去できない）。
function forgetPassword(target) {
  if (target?.options) {
    target.options.password = undefined;
    if (target.options.wsOptions) target.options.wsOptions = undefined;
  }
}

function releaseClient(target) {
  forgetPassword(target);
  if (client === target) client = null;
}

function connect() {
  if (client) return;
  if (typeof window.mqtt?.connect !== 'function') {
    log('MQTT.js を読み込めていません。vendor/mqtt-5.16.1.min.js の配置を確認してください。', 'err');
    setStatus('error', 'エラー');
    return;
  }
  const password = passwordEl.value;
  if (password === '') {
    log('パスワードを入力してください。', 'warn');
    passwordEl.focus();
    return;
  }

  setStatus('connecting', '接続中…');
  log('接続開始 ' + BROKER_URL + ' clientId=' + clientId + ' user=' + USERNAME);

  const target = window.mqtt.connect(BROKER_URL, {
    protocolVersion: 4,           // MQTT 3.1.1
    clientId,
    username: USERNAME,
    password,
    clean: true,
    keepalive: 30,
    connectTimeout: CONNECT_TIMEOUT_MS,
    reconnectPeriod: 0,           // 自動再接続しない（パスワードを保持し続けないため）
    resubscribe: false,
    timerVariant: 'native',       // Worker を使わない（CSP を最小に保つ）
  });
  client = target;
  let opened = false;

  target.on('connect', (connack) => {
    opened = true;
    passwordEl.value = '';        // 接続できたら入力欄からも消す
    setStatus('connected', '接続済み');
    log('接続成功（CONNACK returnCode=' + (connack?.returnCode ?? 0) + '）', 'ok');
  });

  target.on('error', (error) => {
    const code = error?.code;
    const reason = CONNACK_REASONS[code];
    log('エラー: ' + (reason ? reason + '（code ' + code + '）' : (error?.message || String(error))), 'err');
    setStatus('error', reason && (code === 4 || code === 5) ? '認証エラー' : 'エラー');
    target.end(true);
  });

  target.on('offline', () => log('オフライン（通信が途切れました）', 'warn'));

  target.on('close', () => {
    const wasError = statusEl.dataset.state === 'error';
    if (opened) log('接続が切断されました', 'warn');
    else if (wasError) log('接続を終了しました');
    else log('接続を確立できませんでした（ネットワーク・URL・証明書・タイムアウトを確認）', 'err');
    releaseClient(target);
    if (!wasError) setStatus('idle', '未接続');
    else setStatus('error', statusEl.textContent);
  });

  target.on('end', () => releaseClient(target));
}

function disconnect() {
  const target = client;
  if (!target) return;
  log('切断を要求しました');
  target.end(false, () => {
    releaseClient(target);
    setStatus('idle', '未接続');
    log('切断完了');
  });
}

// 0〜180 の数値だけを受け付ける（"45"、"45.5" は可、"1e2"・空・記号は不可）。
function parseAngle(text) {
  const trimmed = String(text).trim();
  if (!/^\d{1,3}(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 && value <= 180 ? value : null;
}

function sendAngle(raw) {
  const angle = parseAngle(raw);
  if (angle === null) {
    angleError.textContent = '0〜180 の数値を入力してください。';
    angleError.hidden = false;
    log('送信中止: 角度が不正です（' + String(raw).slice(0, 20) + '）', 'warn');
    return;
  }
  angleError.hidden = true;
  if (!client || !client.connected) {
    log('送信中止: 接続されていません', 'warn');
    return;
  }
  const payload = JSON.stringify({ v: 1, s: 'ok', a: angle });
  client.publish(TOPIC, payload, { qos: 0, retain: false }, (error) => {
    if (error) {
      log('送信失敗: ' + (error.message || String(error)), 'err');
      return;
    }
    sentCount++;
    $('sent-count').textContent = String(sentCount);
    $('last-payload').textContent = payload;
    log('送信 ' + TOPIC + ' ' + payload + '（QoS 0, retain false）', 'ok');
  });
}

$('broker-url').textContent = BROKER_URL;
$('username').textContent = USERNAME;
$('topic').textContent = TOPIC;
$('client-id').textContent = clientId;

connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', disconnect);
sendBtn.addEventListener('click', () => sendAngle(angleEl.value));
angleEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !sendBtn.disabled) sendAngle(angleEl.value);
});
angleBtns.forEach((button) => button.addEventListener('click', () => sendAngle(button.dataset.angle)));
$('clear-log').addEventListener('click', () => { logEl.textContent = ''; });

// ページを離れるときは接続を閉じる（送信はしない）。
window.addEventListener('pagehide', () => { if (client) client.end(true); });
document.addEventListener('securitypolicyviolation', (event) => {
  log('CSP によりブロック: ' + event.violatedDirective + ' ' + event.blockedURI, 'err');
});

setStatus('idle', '未接続');
log('ページ読込。接続・送信は手動でのみ行います。');
