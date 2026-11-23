import { loadFavorites, saveFavorites } from './favorites.js';
import { validateDestination, validateCoordinates } from './destination.js?v=ui1-coordinates1';
import { updateDestination } from './navigation-ui.js';
import { parseCoordinate } from './coordinates.js?v=ui1-coordinates2';
import { parseDestinationInput } from './destination-input.js?v=ui1-6';
import { closeSheet } from './sheet.js?v=ui1-8-full1';

const byId = id => document.getElementById(id);
const dialog = byId('spots-dialog');
const list = byId('spot-list');
const search = byId('spot-search');
const form = byId('spot-form');
const nameInput = byId('spot-name');
const latitude = byId('spot-latitude');
const longitude = byId('spot-longitude');
const pastedCoordinates = byId('spot-coordinates');
const preview = byId('coordinate-preview');
const confirmation = byId('coordinate-confirmation');
const confirmCoordinates = byId('confirm-coordinates');
const confirmationDistance = 100;
const details = byId('coordinate-details');
const status = byId('spot-status');
const submitSpot = byId('submit-spot');
const coordinatesStep = byId('coordinates-step');
let state;
let editing = null;
let temporary = null;
let editingTemporary = false;
let coordinateSource = 'individual';
const options = byId('destination-options');
const browser = byId('favorite-browser');
const addFavorite = byId('new-spot');
const saveTemporary = byId('save-temporary');

function showView(view) {
  const fullScreen = view === 'editor';
  if (fullScreen) dialog.style.removeProperty('height');
  dialog.classList.toggle('destination-screen', fullScreen);
  byId('close-spots').hidden = fullScreen;
  byId('back-from-destination').hidden = !fullScreen;
  options.hidden = view !== 'options';
  browser.hidden = view !== 'favorites';
  form.hidden = view !== 'editor';
  addFavorite.hidden = view !== 'favorites';
  saveTemporary.hidden = !temporary || !state;
  byId('spots-title').textContent = view === 'editor'
    ? (editingTemporary ? '新しい目的地を指定' : editing ? 'お気に入りを編集' : 'お気に入りに追加')
    : view === 'favorites' ? 'お気に入り' : '目的地を選択';
  if (view !== 'editor') message(view === 'favorites' && !state ? 'お気に入りを読み込めません。' : '', !state);
  dialog.querySelector('.sheet-content').scrollTop = 0;
}

function readCoordinates() {
  return coordinateSource === 'paste' ? parseDestinationInput(pastedCoordinates.value)
    : { ...validateCoordinates(parseCoordinate(latitude.value), parseCoordinate(longitude.value)), method: 'individual' };
}

function showCoordinates() {
  coordinatesStep.classList.remove('step-complete');
  submitSpot.disabled = editingTemporary;
  confirmation.hidden = true;
  confirmCoordinates.checked = false;
  try {
    const coordinates = readCoordinates();
    if (coordinateSource === 'paste') {
      latitude.value = coordinates.latitude;
      longitude.value = coordinates.longitude;
    }
    const codeDetails = coordinates.fullCode ? ' ／ フルPlus Code ' + coordinates.fullCode : '';
    const regionDetails = coordinates.regionName ? ' ／ 復元に使用した地域 ' + coordinates.regionName + '（区役所を基準にした候補）' : '';
    coordinatesStep.classList.add('step-complete');
    submitSpot.disabled = false;
    const method = coordinates.method === 'plus' ? 'Plus Codeを使用' : coordinates.method === 'both'
      ? '両方を読み取り、緯度・経度を優先' : '緯度・経度を使用';
    const difference = coordinates.method === 'both' ? ' ／ 2つの位置の差：約 ' + Math.round(coordinates.differenceMeters) + ' m' : '';
    confirmation.hidden = !(coordinates.differenceMeters > confirmationDistance);
    preview.textContent = '使用する座標　緯度 ' + coordinates.latitude + ' ／ 経度 ' + coordinates.longitude + ' ／ ' +
      method + codeDetails + regionDetails + difference;
    preview.dataset.error = 'false';
  } catch (error) {
    const empty = coordinateSource === 'individual' && !latitude.value.trim() && !longitude.value.trim();
    preview.textContent = empty ? '' : error.message;
    preview.dataset.error = String(!empty);
  }
}

function message(text = '', error = false) {
  status.textContent = text;
  status.dataset.error = String(error);
}

function renderList() {
  const query = search.value.trim().normalize('NFKC').toLocaleLowerCase('ja');
  const visible = state?.spots.filter(spot => spot.name.normalize('NFKC').toLocaleLowerCase('ja').includes(query)) ?? [];
  const rows = visible.map(spot => {
    const row = document.createElement('li');
    const choose = document.createElement('button');
    const edit = document.createElement('button');
    const note = document.createElement('small');
    row.className = 'spot-row';
    choose.className = 'spot-select';
    choose.textContent = spot.name;
    const selected = !temporary && spot.id === state.selectedId;
    choose.setAttribute('aria-pressed', String(selected));
    if (selected) {
      note.textContent = '選択中';
      choose.append(note);
    }
    choose.addEventListener('click', () => {
      if (commit({ ...state, selectedId: spot.id }, true)) closeSheet(dialog);
    });
    edit.textContent = '編集';
    edit.setAttribute('aria-label', spot.name + 'を編集');
    edit.addEventListener('click', () => openEditor(spot));
    row.append(choose, edit);
    return row;
  });
  if (state && rows.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'status';
    empty.textContent = query ? '一致するスポットがありません。' : 'スポットを追加すると一覧に表示されます。';
    rows.push(empty);
  }
  list.replaceChildren(...rows);
}

function publish() {
  updateDestination(temporary ?? state?.spots.find(spot => spot.id === state.selectedId) ?? null);
}

function commit(next, selectFavorite = false) {
  try {
    saveFavorites(next);
  } catch {
    message('変更を保存できませんでした。端末の保存設定や空き容量を確認してください。', true);
    return false;
  }
  state = next;
  if (selectFavorite) temporary = null;
  publish();
  renderList();
  message();
  return true;
}

function closeEditor() {
  editing = null;
  showView(editingTemporary ? 'options' : 'favorites');
}

function openEditor(spot, asTemporary = false) {
  if (!state && !asTemporary) return;
  editingTemporary = asTemporary;
  editing = spot?.id ?? null;
  submitSpot.textContent = asTemporary ? '目的地を設定' : 'お気に入りに保存';
  byId('spot-name-label').textContent = asTemporary ? '目的地名（任意）' : '目的地名';
  nameInput.required = !asTemporary;
  byId('delete-spot').hidden = !editing;
  nameInput.value = spot?.name ?? '';
  byId('name-step').classList.toggle('step-complete', Boolean(nameInput.value.trim()));
  byId('map-step').classList.remove('step-complete');
  latitude.value = spot?.latitude ?? '';
  longitude.value = spot?.longitude ?? '';
  pastedCoordinates.value = '';
  coordinateSource = 'individual';
  details.open = false;
  byId('coordinate-help').open = false;
  showCoordinates();
  showView('editor');
  message();
  byId('spots-title').focus({ preventScroll: true });
}

try {
  state = loadFavorites();
  publish();
} catch {
  message('お気に入りを読み込めません。ブラウザの保存設定を確認してください。', true);
  byId('new-spot').disabled = true;
}
renderList();

search.addEventListener('input', renderList);
nameInput.addEventListener('input', () => byId('name-step').classList.toggle('step-complete', Boolean(nameInput.value.trim())));
form.querySelector('.map-link').addEventListener('click', () => byId('map-step').classList.add('step-complete'));
pastedCoordinates.addEventListener('input', () => {
  coordinateSource = 'paste';
  message();
  showCoordinates();
});
for (const input of [latitude, longitude]) {
  input.addEventListener('input', () => {
    coordinateSource = 'individual';
    pastedCoordinates.value = '';
    message();
    showCoordinates();
  });
}
const helpButtons = [byId('help-iphone'), byId('help-pc')];
const helpSteps = [byId('help-iphone-steps'), byId('help-pc-steps')];
helpButtons.forEach((button, selected) => {
  button.addEventListener('click', () => {
    helpButtons.forEach((item, index) => {
      item.setAttribute('aria-pressed', String(index === selected));
      helpSteps[index].hidden = index !== selected;
    });
  });
});
addFavorite.addEventListener('click', () => openEditor());
byId('new-temporary').addEventListener('click', () => openEditor(null, true));
byId('browse-favorites').addEventListener('click', () => {
  showView('favorites');
  addFavorite.focus();
});
byId('back-to-options').addEventListener('click', () => {
  showView('options');
  byId('new-temporary').focus();
});
dialog.addEventListener('planetes:open', event => showView(event.detail));
saveTemporary.addEventListener('click', () => {
  if (!temporary || !state) return;
  const id = crypto.randomUUID();
  if (commit({ spots: [...state.spots, { ...temporary, id }], selectedId: id }, true)) closeSheet(dialog);
});
function returnFromEditor() {
  closeEditor();
  (editingTemporary ? byId('new-temporary') : addFavorite).focus();
}
byId('cancel-spot').addEventListener('click', returnFromEditor);
byId('back-from-destination').addEventListener('click', returnFromEditor);
form.addEventListener('submit', event => {
  event.preventDefault();
  try {
    const coordinates = readCoordinates();
    if (coordinates.differenceMeters > confirmationDistance && !confirmCoordinates.checked) {
      message('緯度・経度とPlus Codeの位置が離れています。確認欄にチェックしてから設定してください。', true);
      confirmCoordinates.focus();
      return;
    }
    const name = nameInput.value.trim() || (editingTemporary ? '一時目的地' : '');
    const destination = validateDestination(name, coordinates.latitude, coordinates.longitude);
    if (editingTemporary) {
      // 一時目的地はこのページのメモリに保持し、既存の選択と保存データを残す。
      temporary = destination;
      publish();
      renderList();
      closeSheet(dialog);
      return;
    }
    const id = editing ?? crypto.randomUUID();
    const spot = { id, ...destination };
    const spots = editing ? state.spots.map(item => item.id === id ? spot : item) : [...state.spots, spot];
    if (commit({ spots, selectedId: editing ? state.selectedId : id }, !editing)) {
      search.value = '';
      renderList();
      closeEditor();
      byId('new-spot').focus();
    }
  } catch (error) {
    message(error.message, true);
  }
});
byId('delete-spot').addEventListener('click', () => {
  if (!editing) return;
  const spots = state.spots.filter(spot => spot.id !== editing);
  const selectedId = state.selectedId === editing ? null : state.selectedId;
  if (commit({ spots, selectedId })) {
    closeEditor();
    byId('new-spot').focus();
  }
});

