// 針の相対角（端末上端0°・時計回り正）から、ATOM Liteへ送るメッセージを決める純粋関数。
// DOMやMQTTに依存しないので、Nodeで単体テストできる（mqtt-mapping.test.mjs）。

// サーボへ送る指令値の絶対的な上下限（初期テスト用。中心90°付近だけを使う）。
export const HARD_MIN = 55;
export const HARD_MAX = 125;
// 範囲外から戻るときは、この分だけ内側に入るまで範囲外のままにする（境界でのばたつき防止）。
export const HYSTERESIS = 5;
// 送信用の有効条件。画面表示より厳しくする。
export const MAX_ACCURACY = 20;          // webkitCompassAccuracy（°）。不明・20°超は送らない
export const MAX_SENSOR_AGE_MS = 1000;   // 方位センサーの最終受信からの経過
export const MAX_POSITION_AGE_MS = 60000; // GPSの測位時刻からの経過（app.jsの古さ判定と同じ）

export const DEFAULT_SETTINGS = Object.freeze({ range: 30, center: 90, scale: 1, invert: false });

// [0,360) → [-180,180)
export function signedDelta(angle) {
  return ((angle % 360) + 540) % 360 - 180;
}

// detail: compass-ui.js の 'planetes:needle' イベントの内容
// state:  { inRange } ヒステリシス用の前回状態（呼び出し側が保持する）
// 戻り値: { message, inRange, delta }  message は {v,s,a?}
export function decide(detail, settings, state, now) {
  const status = (s, inRange = false) => ({ message: { v: 1, s }, inRange, delta: null });
  if (!detail) return status('no_heading');
  const { angle } = detail;
  if (angle === null || !Number.isFinite(angle)) {
    if (!detail.hasDestination) return status('no_destination');
    if (!detail.positionOk) return status('no_position');
    return status('no_heading');
  }
  const { accuracy } = detail;
  if (!(Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= MAX_ACCURACY)) return status('low_accuracy');
  if (!Number.isFinite(detail.sensorTimestamp) || now - detail.sensorTimestamp > MAX_SENSOR_AGE_MS) return status('no_heading');
  if (!Number.isFinite(detail.positionTimestamp) || now - detail.positionTimestamp > MAX_POSITION_AGE_MS) return status('stale_position');
  if (detail.lowGpsAccuracy) return status('near_destination');

  const delta = signedDelta(angle);
  const limit = settings.range;
  const wasIn = Boolean(state?.inRange);
  const inRange = wasIn ? Math.abs(delta) <= limit : Math.abs(delta) <= limit - HYSTERESIS;
  if (!inRange) return { message: { v: 1, s: 'out_of_range' }, inRange: false, delta };

  const sign = settings.invert ? -1 : 1;
  const servo = Math.round(settings.center + sign * settings.scale * delta);
  // 校正値の誤りなどで中心付近から外れる指令は送らない。
  if (!(servo >= HARD_MIN && servo <= HARD_MAX)) return { message: { v: 1, s: 'out_of_range' }, inRange: false, delta };
  return { message: { v: 1, s: 'ok', a: servo }, inRange: true, delta };
}

// 前回送信と比べて、送る必要があるか。
export function shouldSend(message, last, deadband = 2) {
  if (!last) return true;
  if (message.s !== last.s) return true;
  if (message.s !== 'ok') return false;            // 同じ状態の繰り返しは送らない
  return Math.abs(message.a - last.a) >= deadband;
}

export function validSettings(settings) {
  const { range, center, scale } = settings;
  return [15, 30, 45].includes(range) &&
    Number.isFinite(center) && center >= 70 && center <= 110 &&
    Number.isFinite(scale) && scale >= 0.5 && scale <= 2;
}
