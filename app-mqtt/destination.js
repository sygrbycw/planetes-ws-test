const storageKey = 'planetes.destination';

function validateCoordinate(value, label, limit) {
  if (!Number.isFinite(value)) {
    throw new Error(label + 'を数値で入力してください。');
  }
  if (value < -limit || value > limit) {
    throw new Error(label + 'は -' + limit + '〜' + limit + ' の範囲で入力してください。');
  }
  return value;
}

export function validateDestination(name, latitude, longitude) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('目的地名を入力してください。');
  }
  return {
    name: name.trim(),
    ...validateCoordinates(latitude, longitude),
  };
}

export function validateCoordinates(latitude, longitude) {
  return {
    latitude: validateCoordinate(latitude, '緯度', 90),
    longitude: validateCoordinate(longitude, '経度', 180),
  };
}

// 保存済みの座標を、後続の方位計算からも取得できるようにする。
export function loadDestination() {
  let raw;
  try {
    raw = window.localStorage.getItem(storageKey);
  } catch {
    throw new Error('保存済みの目的地を読み込めません。ブラウザの保存設定を確認してください。');
  }
  if (raw === null) return null;

  try {
    const data = JSON.parse(raw);
    return validateDestination(data.name, data.latitude, data.longitude);
  } catch {
    throw new Error('保存済みの目的地データが無効です。入力して保存し直すか、削除してください。');
  }
}

export function saveDestination(name, latitude, longitude) {
  // 保存対象は目的地の3項目だけ。書き込みが成功してから画面に反映する。
  const destination = validateDestination(name, latitude, longitude);
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(destination));
  } catch {
    throw new Error('目的地を保存できません。ブラウザの保存設定や空き容量を確認してください。');
  }
  return destination;
}

export function deleteDestination() {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    throw new Error('目的地を削除できません。ブラウザの保存設定を確認してください。');
  }
}
