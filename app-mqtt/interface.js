import { openSheet, closeSheet, enableSheetDrag, keepFieldsVisible } from './sheet.js?v=ui1-8-full1';

const byId = id => document.getElementById(id);
const spots = byId('spots-dialog');
const settings = byId('settings-dialog');
const developer = byId('developer');
const openSpots = byId('open-spots');
const closeSpots = byId('close-spots');

function showSpots(view = 'options') {
  if (spots.open) return;
  spots.dispatchEvent(new CustomEvent('planetes:open', { detail: view }));
  openSheet(spots, byId('spots-title'));
}

openSpots.addEventListener('click', () => showSpots());
byId('open-settings').addEventListener('click', () => openSheet(settings, byId('settings-title')));
byId('close-settings').addEventListener('click', () => closeSheet(settings));
byId('manage-spots').addEventListener('click', () => {
  settings.close();
  settings.classList.remove('sheet-visible');
  showSpots('favorites');
});
for (const dialog of [spots, settings]) {
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeSheet(dialog);
  });
  let outsideDown = false;
  const outside = event => {
    const rect = dialog.getBoundingClientRect();
    return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom);
  };
  dialog.addEventListener('pointerdown', event => { outsideDown = outside(event); });
  dialog.addEventListener('click', event => {
    if (outsideDown && outside(event)) closeSheet(dialog);
    outsideDown = false;
  });
}

enableSheetDrag(spots, closeSpots);
keepFieldsVisible(spots);
let swipeStart;
openSpots.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  swipeStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
  openSpots.setPointerCapture(event.pointerId);
});
openSpots.addEventListener('pointerup', event => {
  if (swipeStart?.id !== event.pointerId) return;
  const vertical = swipeStart.y - event.clientY;
  if (vertical >= 35 && vertical > Math.abs(swipeStart.x - event.clientX)) showSpots();
  swipeStart = null;
});
openSpots.addEventListener('pointercancel', () => { swipeStart = null; });

let taps = 0;
byId('app-version').addEventListener('click', () => {
  if (++taps === 7) developer.hidden = false;
});
byId('disable-developer').addEventListener('click', () => {
  taps = 0;
  developer.hidden = true;
  const mode = byId('correction-mode');
  mode.value = 'auto';
  mode.dispatchEvent(new Event('change'));
  byId('app-version').focus();
});
settings.addEventListener('close', () => { taps = 0; });

let errors = [];
function recordError(message) {
  errors = [...errors.slice(-7), String(message).slice(0, 400)];
  byId('app-errors').textContent = errors.join('\n');
}
window.addEventListener('error', event => recordError(event.message || 'ファイルの読み込みエラー'));
window.addEventListener('unhandledrejection', event => recordError(event.reason?.message ?? event.reason));

const svg = byId('compass-dial');
function draw(tag, attributes, value) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, attribute] of Object.entries(attributes)) node.setAttribute(name, attribute);
  if (value !== undefined) node.textContent = value;
  svg.append(node);
}
function point(degrees, radius) {
  const radians = degrees * Math.PI / 180;
  return [180 + Math.sin(radians) * radius, 180 - Math.cos(radians) * radius];
}
for (let angle = 0; angle < 360; angle += 2) {
  const major = angle % 30 === 0;
  const [x1, y1] = point(angle, major ? 114 : angle % 10 === 0 ? 118 : 121);
  const [x2, y2] = point(angle, 134);
  draw('line', { x1, y1, x2, y2, 'stroke-width': major ? 1.8 : 0.75 });
  if (major) {
    const [x, y] = point(angle, 155);
    draw('text', { x, y, 'font-size': 13 }, angle);
  }
}
for (const [angle, text] of [[0,'N'], [90,'E'], [180,'S'], [270,'W']]) {
  const [x, y] = point(angle, 87);
  draw('text', { x, y, 'font-size': 24, class: 'dial-' + text.toLowerCase() }, text);
}

