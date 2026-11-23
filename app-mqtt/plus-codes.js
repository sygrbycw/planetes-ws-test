import { tokyoWards } from './tokyo-wards.js?v=ui1-plus1';
// Google Open Location Code 1.0.3 (Apache-2.0): https://github.com/google/open-location-code/tree/1.0.3/js

export function parsePlusCode(input) {
  const text = input.normalize('NFKC').trim();
  const [token, region = ''] = text.split(/\s+(.*)/s, 2);
  // 符号付きの数値は従来の座標パーサーに渡す。
  if (!/^[A-Z0-9]*\+[A-Z0-9]*$/i.test(token) || /^\+\d*$/.test(token)) return null;
  const olc = globalThis.OpenLocationCode;
  if (!olc) throw new Error('Plus Codeの変換機能を読み込めませんでした。ページを再読み込みしてください。');

  let fullCode = token.toUpperCase();
  let regionName = null;
  if (olc.isShort(fullCode)) {
    const key = region.replace(/[\s,、]/g, '').replace(/^東京都|東京都$/g, '');
    const reference = tokyoWards.get(key);
    if (!reference) {
      throw new Error(region ? '対応していない地域です。東京23区の区名付きコードか、フルPlus Codeを使ってください。'
        : '短縮Plus Codeには東京23区の区名が必要です。区名付きでコピーするか、フルPlus Codeを使ってください。');
    }
    fullCode = olc.recoverNearest(fullCode, ...reference);
    regionName = '東京都' + key;
  } else if (!olc.isFull(fullCode) || region) {
    throw new Error('有効なフルPlus Codeか、区名付きの短縮Plus Codeを貼り付けてください。');
  }

  const area = olc.decode(fullCode);
  return { latitude: area.latitudeCenter, longitude: area.longitudeCenter, fullCode, regionName };
}
