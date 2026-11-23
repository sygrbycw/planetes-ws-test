// NOAA NCEI Geomagnetic Modeling Team and BGS, World Magnetic Model 2025.
// Official coefficient data (U.S. public domain): https://doi.org/10.25921/aqfd-sd83
// PLANETES implementation of the equations in https://doi.org/10.25923/prbc-s316
const degree = 12;
const radians = Math.PI / 180;
const matrix = () => Array.from({ length: degree + 1 }, () => Array(degree + 1).fill(0));

export function decimalYear(date) {
  // 端末の暦日を採用し、うるう年の日数も反映する。
  const year = date.getFullYear();
  const first = Date.UTC(year, 0, 1);
  const day = Date.UTC(year, date.getMonth(), date.getDate());
  return year + (day - first) / (Date.UTC(year + 1, 0, 1) - first);
}

export function createWmm2025(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const rows = lines.filter(line => !/^9{10,}/.test(line.trim()));
  const coefficients = [];
  if (!/^2025\.0\s+WMM-2025\s/.test(header) || rows.length !== 90) {
    throw new Error('WMM2025の係数ファイルが無効です。');
  }
  for (let n = 1; n <= degree; n++) {
    let normalization = 1;
    for (let m = 0; m <= n; m++) {
      const row = rows[coefficients.length].trim().split(/\s+/).map(Number);
      if (row.length !== 6 || !row.every(Number.isFinite) || row[0] !== n || row[1] !== m) {
        throw new Error('WMM2025の係数ファイルが無効です。');
      }
      if (m > 0) normalization *= Math.sqrt((m === 1 ? 2 : 1) / ((n - m + 1) * (n + m)));
      coefficients.push([...row, normalization]);
    }
  }

  return (latitude, longitude, year, altitudeKm = 0) => {
    if (!Number.isFinite(year) || year < 2025 || year >= 2030) {
      throw new Error('WMM2025の有効期間外です（2025年1月1日〜2029年12月31日）。端末の日付を確認してください。');
    }
    if (![latitude, longitude, altitudeKm].every(Number.isFinite) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || altitudeKm < -1 || altitudeKm > 850) {
      throw new Error('WMM2025の計算範囲外の座標または高度です。');
    }
    if (Math.abs(latitude) === 90) throw new Error('地理上の極では偏角を定義できません。');

    // WGS84測地緯度・楕円体高から地心座標へ変換する。
    const phi = latitude * radians;
    const lambda = longitude * radians;
    const eccentricitySquared = 6.6943799901413165e-3;
    const primeVertical = 6378.137 / Math.sqrt(1 - eccentricitySquared * Math.sin(phi) ** 2);
    const rho = (primeVertical + altitudeKm) * Math.cos(phi);
    const z = (primeVertical * (1 - eccentricitySquared) + altitudeKm) * Math.sin(phi);
    const radius = Math.hypot(rho, z);
    const delta = phi - Math.atan2(z, rho);
    const sin = rho / radius;
    const cos = z / radius;
    const p = matrix();
    const derivative = matrix();
    p[0][0] = 1;
    let radial = 0;
    let north = 0;
    let east = 0;
    for (const [n, m, g, h, dg, dh, normalization] of coefficients) {
      // 非正規化ルジャンドル関数と余緯度微分を漸化式で求める。
      if (n === m) {
        p[n][m] = (2 * n - 1) * sin * p[n - 1][m - 1];
        derivative[n][m] = (2 * n - 1) * (cos * p[n - 1][m - 1] + sin * derivative[n - 1][m - 1]);
      } else {
        const prior = p[n - 1][m];
        const priorDerivative = derivative[n - 1][m];
        const factor = n + m - 1;
        p[n][m] = ((2 * n - 1) * cos * prior - factor * (p[n - 2]?.[m] ?? 0)) / (n - m);
        derivative[n][m] = ((2 * n - 1) * (cos * priorDerivative - sin * prior) -
          factor * (derivative[n - 2]?.[m] ?? 0)) / (n - m);
      }
      const scale = normalization * (6371.2 / radius) ** (n + 2);
      const gNow = g + (year - 2025) * dg;
      const hNow = h + (year - 2025) * dh;
      const cosine = Math.cos(m * lambda);
      const sine = Math.sin(m * lambda);
      const term = scale * (gNow * cosine + hNow * sine);
      radial += (n + 1) * term * p[n][m];
      north += term * derivative[n][m];
      east += scale * m * (gNow * sine - hNow * cosine) * p[n][m] / sin;
    }
    north = north * Math.cos(delta) - radial * Math.sin(delta);
    const horizontal = Math.hypot(north, east);
    return { declination: Math.atan2(east, north) / radians, horizontal, north, east };
  };
}

export async function loadWmm2025(signal) {
  const url = new URL('./WMM2025.COF', import.meta.url);
  url.search = new URL(import.meta.url).search;
  let response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('WMM2025.COF を読み込めません。通信と公開先を確認してください。');
  }
  if (!response.ok) throw new Error('WMM2025.COF を読み込めません（HTTP ' + response.status + '）。');
  const field = createWmm2025(await response.text());
  return (latitude, longitude, date) => field(latitude, longitude, decimalYear(date));
}
